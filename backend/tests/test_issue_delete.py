"""Soft delete of issues by the reporter or the assigned Lead."""
from tests.conftest import EMPLOYEE, EMPLOYEE2, LEAD, LEAD2, auth


def delete(client, iid, who, reason=None):
    return client.request("DELETE", f"/issues/{iid}", json={"reason": reason} if reason else None, headers=auth(who))


def test_reporter_can_delete_and_issue_disappears_everywhere(client, make_issue, db):
    iid = make_issue(title="Delete me please")["id"]
    t = client.post(f"/issues/{iid}/tasks", json={"title": "Some task"}, headers=auth(LEAD)).json()
    client.post(f"/issues/{iid}/comments", json={"content": "Unique-deleted-comment"}, headers=auth(LEAD))
    client.post(f"/issues/{iid}/blockers", json={"reason": "Waiting"}, headers=auth(LEAD))

    r = delete(client, iid, EMPLOYEE, reason="Reported by mistake")
    assert r.status_code == 200 and r.json() == {"deleted": iid}

    assert client.get(f"/issues/{iid}", headers=auth(LEAD)).status_code == 404
    assert client.get(f"/issues/{iid}/activity", headers=auth(LEAD)).status_code == 404
    assert iid not in [i["id"] for i in client.get("/issues", params={"status": "any"}, headers=auth(LEAD)).json()]
    assert iid not in [d["id"] for d in client.get("/discussions", params={"include_closed": True}, headers=auth(LEAD)).json()]
    assert t["id"] not in [x["id"] for x in client.get("/tasks", params={"include_closed": True}, headers=auth(LEAD)).json()]
    assert client.patch(f"/tasks/{t['id']}/move", json={"status": "Done"}, headers=auth(LEAD)).status_code == 404
    found = client.get("/search", params={"q": "Unique-deleted-comment"}, headers=auth(LEAD)).json()
    assert found["discussions"] == []
    assert client.get("/search", params={"q": f"KT-{iid}"}, headers=auth(LEAD)).json()["issues"] == []
    hits = client.get("/issues/duplicates", params={"q": "Delete me please"}, headers=auth(EMPLOYEE2)).json()
    assert iid not in [h["id"] for h in hits]

    # Row is kept for audit with who/when/why; open blockers were stopped.
    row = db.execute("select deleted_at, deletion_reason, (select email from users where id = deleted_by_user_id) "
                     "from issues where id = %s", (iid,)).fetchone()
    assert row[0] is not None and row[1] == "Reported by mistake" and row[2] == EMPLOYEE
    assert db.execute("select count(*) from blockers where issue_id = %s and is_active", (iid,)).fetchone()[0] == 0
    assert db.execute("select action_type from activity_log where issue_id = %s order by id desc limit 1",
                      (iid,)).fetchone()[0] == "deleted"


def test_assigned_lead_is_notified_and_old_notifications_hidden(client, make_issue, sent_emails):
    client.post("/notifications/read-all", headers=auth(LEAD))
    iid = make_issue(title="Notify on delete")["id"]           # creates 'issue_assigned' for Anna
    delete(client, iid, EMPLOYEE)
    feed = client.get("/notifications", headers=auth(LEAD)).json()
    about = [n for n in feed["items"] if n["issue_id"] == iid]
    assert [n["type"] for n in about] == ["issue_deleted"]      # the stale 'assigned' link is hidden
    assert about[0]["link"] is None and "was deleted by Kasia Zielinska" in about[0]["message"]
    assert feed["unread_count"] == 1
    assert sent_emails[-1]["to"] == [LEAD] and "deleted" in sent_emails[-1]["subject"]


def test_only_reporter_or_assigned_lead(client, make_issue):
    iid = make_issue(title="Delete permissions")["id"]          # reporter Kasia, lead Anna (Operations)
    assert delete(client, iid, EMPLOYEE2).status_code == 403   # unrelated employee
    assert delete(client, iid, LEAD2).status_code == 403       # a Lead, but not the assigned one
    assert delete(client, iid, LEAD).status_code == 200        # the assigned Lead
    assert delete(client, iid, LEAD).status_code == 404        # already gone


def test_reassigned_lead_gains_and_previous_loses_the_right(client, make_issue, users):
    iid = make_issue(title="Delete after reassignment")["id"]
    client.patch(f"/issues/{iid}", json={"lead_id": users[LEAD2]["id"]}, headers=auth(LEAD))
    assert delete(client, iid, LEAD).status_code == 403
    assert delete(client, iid, LEAD2).status_code == 200


def test_closed_issue_cannot_be_deleted_but_rejected_can(client, make_issue):
    iid = make_issue(title="Closed record")["id"]
    t = client.post(f"/issues/{iid}/tasks", json={"title": "Fix"}, headers=auth(LEAD)).json()
    client.patch(f"/tasks/{t['id']}/move", json={"status": "Done"}, headers=auth(LEAD))
    client.post(f"/issues/{iid}/resolve", json={"root_cause": "Other"}, headers=auth(LEAD))
    client.post(f"/issues/{iid}/confirm-resolution", headers=auth(EMPLOYEE))
    r = delete(client, iid, EMPLOYEE)
    assert r.status_code == 409 and "quality record" in r.json()["detail"]

    rej = make_issue(title="Rejected then deleted")["id"]
    client.post(f"/issues/{rej}/reject", json={"reason": "Not a defect"}, headers=auth(LEAD))
    assert delete(client, rej, EMPLOYEE).status_code == 200


def test_deleted_issue_excluded_from_dashboard(client, make_issue):
    iid = make_issue(title="Dashboard delete", priority="Critical", effort="Low")["id"]
    before = client.get("/dashboard", headers=auth(LEAD)).json()["scope"]["issue_count"]
    delete(client, iid, EMPLOYEE)
    assert client.get("/dashboard", headers=auth(LEAD)).json()["scope"]["issue_count"] == before - 1
