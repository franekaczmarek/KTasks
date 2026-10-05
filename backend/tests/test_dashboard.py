"""Step 7: dashboard aggregations and PDF/Excel export, on a controlled set of issues."""
from datetime import datetime, timedelta
from io import BytesIO
from zoneinfo import ZoneInfo

import pytest
from openpyxl import load_workbook

from app.services import dashboard as dash
from tests.conftest import EMPLOYEE, LEAD, auth

WAW = ZoneInfo("Europe/Warsaw")
MON = datetime(2026, 9, 28, 9, tzinfo=WAW)


@pytest.fixture
def scenario(client, make_issue, db, monkeypatch):
    """A: open Critical/Low quick win, lead replied after 1 bd, 1 bd blocker.
    B: resolved by the lead (Vendor, within SLA).  C: closed long ago, Training, SLA breached, no lead response."""
    a = make_issue(title="Dash A", priority="Critical", effort="Low", area="Operations")["id"]
    b = make_issue(title="Dash B", priority="High", effort="Medium", area="Operations")["id"]
    c = make_issue(title="Dash C", priority="Low", effort="High", area="Process")["id"]

    db.execute("update public.issues set created_at = %s where id = %s", (MON, a))
    cid = client.post(f"/issues/{a}/comments", json={"content": "on it"}, headers=auth(LEAD)).json()["id"]
    db.execute("update public.comments set created_at = %s where id = %s", (MON + timedelta(days=1), cid))
    bid = client.post(f"/issues/{a}/blockers", json={"reason": "Waiting for Vendor  part"}, headers=auth(EMPLOYEE)).json()["id"]
    client.post(f"/blockers/{bid}/resolve", headers=auth(LEAD))
    db.execute("update public.blockers set created_at = %s, resolved_at = %s where id = %s",
               (MON + timedelta(days=2), MON + timedelta(days=3), bid))
    # The lead's blocker resolution is also a "response"; keep A's first response at the comment.
    db.execute("update public.activity_log set created_at = %s where issue_id = %s and action_type <> 'created'",
               (MON + timedelta(days=3), a))

    t = client.post(f"/issues/{b}/tasks", json={"title": "Fix it"}, headers=auth(LEAD)).json()
    client.patch(f"/tasks/{t['id']}/move", json={"status": "Done"}, headers=auth(LEAD))
    client.post(f"/issues/{b}/resolve", json={"root_cause": "Vendor"}, headers=auth(LEAD))

    old = datetime.now(WAW) - timedelta(days=40)
    db.execute("update public.issues set created_at = %s, status = 'Closed', root_cause = 'Training', "
               "start_date = %s, resolved_at = now(), closed_at = now() where id = %s", (old, old, c))

    ids = {a, b, c}
    real = dash.scoped_issues
    monkeypatch.setattr(dash, "scoped_issues", lambda conn, area, days, *rest: [
        i for i in real(conn, area, days, *rest) if i["id"] in ids])
    return {"a": a, "b": b, "c": c}


def test_kpis(client, scenario):
    d = client.get("/dashboard", headers=auth(EMPLOYEE)).json()
    k = d["kpis"]
    assert d["scope"]["issue_count"] == 3
    assert k["open_issues"] == 2                               # A (New) + B (Resolved)
    assert k["sla_finished_count"] == 2 and k["sla_met_count"] == 1
    assert k["sla_compliance_pct"] == 50.0
    assert k["responded_count"] == 2                            # C never got a lead response
    assert k["avg_lead_response_days"] == pytest.approx(0.5, abs=0.01)   # A: 1 bd, B: ~0
    assert d["status_counts"] == {"New": 1, "In Progress": 0, "Resolved": 1, "Closed": 1, "Rejected": 0}
    assert "issues" not in d
    # A is active and past its Critical target; B met its SLA; C missed it.
    assert d["sla_status"] == {"active": {"on_track": 0, "at_risk": 0, "breached": 1},
                               "finished": {"met": 1, "breached": 1}, "agreed_count": 0, "pending_requests": 0}


def test_quick_wins_root_causes_and_blockers(client, scenario):
    d = client.get("/dashboard", headers=auth(EMPLOYEE)).json()
    cells = {(c["priority"], c["effort"]): c for c in d["quick_wins"]}
    assert len(cells) == 12
    assert cells[("Critical", "Low")]["count"] == 1 and cells[("Critical", "Low")]["quick_win"] is True
    assert cells[("High", "Medium")]["count"] == 1 and cells[("High", "Medium")]["quick_win"] is False
    assert cells[("Low", "High")]["count"] == 0, "closed issues are not in the matrix"
    assert cells[("Critical", "Low")]["issues"][0]["id"] == scenario["a"]

    rc = {r["root_cause"]: r["count"] for r in d["root_causes"]}
    assert rc["Vendor"] == 1 and rc["Training"] == 1 and rc["Procedure"] == 0
    assert d["root_causes"][0]["count"] == 1  # sorted desc

    bl = d["blockers"]
    assert bl["total_days"] == 1.0 and bl["active"] == 0
    assert bl["top_reasons"] == [{"reason": "Waiting for Vendor  part", "count": 1, "days": 1.0}]


def test_area_filter(client, scenario):
    d = client.get("/dashboard", params={"area": "Process"}, headers=auth(EMPLOYEE)).json()
    assert d["scope"]["issue_count"] == 1 and d["kpis"]["open_issues"] == 0
    assert client.get("/dashboard", params={"area": "HR"}, headers=auth(EMPLOYEE)).status_code == 422
    assert client.get("/dashboard", params={"days": 0}, headers=auth(EMPLOYEE)).status_code == 422


def test_days_filter(client, scenario):
    d = client.get("/dashboard", params={"days": 30}, headers=auth(EMPLOYEE)).json()
    assert d["scope"]["issue_count"] == 2  # A and B are recent; C was created 40 days ago
    assert client.get("/dashboard", params={"days": 60}, headers=auth(EMPLOYEE)).json()["scope"]["issue_count"] == 3


def test_export_xlsx(client, scenario):
    r = client.get("/reports/export", params={"format": "xlsx"}, headers=auth(LEAD))
    assert r.status_code == 200
    assert r.headers["content-disposition"].startswith('attachment; filename="ktasks-report-')
    wb = load_workbook(BytesIO(r.content))
    assert wb.sheetnames == ["Summary", "SLA status", "Issues", "Root causes", "Quick wins", "Blockers"]
    sla = list(wb["SLA status"].iter_rows(values_only=True))
    assert sla[0] == ("Group", "SLA phase", "Issues") and ("Resolved / Closed", "Met", 1) in sla
    issues = list(wb["Issues"].iter_rows(values_only=True))
    assert issues[0][0] == "ID" and len(issues) == 4
    assert {row[0] for row in issues[1:]} == {f"KT-{i}" for i in scenario.values()}
    summary = {row[0]: row[1] for row in wb["Summary"].iter_rows(values_only=True) if row and row[0]}
    assert summary["Open issues"] == 2


def test_export_pdf(client, scenario):
    r = client.get("/reports/export", params={"format": "pdf"}, headers=auth(LEAD))
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF") and len(r.content) > 2000


def test_export_requires_auth(client):
    assert client.get("/reports/export").status_code == 401
    assert client.get("/dashboard").status_code == 401


def test_rejected_issues_are_excluded_from_open_and_sla(client, scenario):
    client.post(f"/issues/{scenario['a']}/reject", json={"reason": "Out of scope for QA"}, headers=auth(LEAD))
    d = client.get("/dashboard", headers=auth(EMPLOYEE)).json()
    assert d["status_counts"]["Rejected"] == 1
    assert d["kpis"]["open_issues"] == 1                     # only B remains open
    assert d["kpis"]["sla_finished_count"] == 2              # rejected issues don't count toward SLA
    assert sum(c["count"] for c in d["quick_wins"]) == 1     # A left the quick-wins matrix
