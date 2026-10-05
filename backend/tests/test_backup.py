"""An employee as backup: acts as Lead on the owner's issues while the owner is absent."""
from contextlib import contextmanager

from tests.conftest import EMPLOYEE, EMPLOYEE2, EMPLOYEE3, LEAD, LEAD2, auth


@contextmanager
def ola_covers_marek(client, users, absent=True):
    """Marek (Improvements) gets Ola (employee) as backup; demo state is restored afterwards."""
    marek = users[LEAD2]["id"]
    try:
        r = client.patch(f"/users/{marek}", json={"backup_lead_id": users[EMPLOYEE3]["id"], "is_absent": absent},
                         headers=auth(LEAD))
        assert r.status_code == 200, r.text
        yield
    finally:
        client.patch(f"/users/{marek}", json={"backup_lead_id": users[LEAD]["id"], "is_absent": False},
                     headers=auth(LEAD))


def test_employee_backup_stands_in_while_owner_is_absent(client, users, make_issue, sent_emails):
    earlier = make_issue(title="Marek's issue before absence", area="Improvements")["id"]
    with ola_covers_marek(client, users):
        routed = make_issue(title="Routed to employee backup", area="Improvements")
        assert routed["lead_id"] == users[EMPLOYEE3]["id"]
        assert sent_emails[-1]["to"] == [EMPLOYEE3]          # acting backups get the Lead mail
        rid = routed["id"]

        # Ola acts as Lead on routed and on Marek's existing issues; another employee can't.
        for iid in (rid, earlier):
            r = client.patch(f"/issues/{iid}", json={"status": "In Progress"}, headers=auth(EMPLOYEE3))
            assert r.status_code == 200 and r.json()["viewer_can_lead"] is True
        assert client.patch(f"/issues/{earlier}", json={"priority": "High"},
                            headers=auth(EMPLOYEE2)).status_code == 403
        assert client.post(f"/issues/{earlier}/tasks/from-templates", json={},
                           headers=auth(EMPLOYEE3)).status_code == 201
        task = client.post(f"/issues/{rid}/tasks", json={"title": "Stand-in fix"}, headers=auth(EMPLOYEE3)).json()
        client.patch(f"/tasks/{task['id']}/move", json={"status": "Done"}, headers=auth(EMPLOYEE3))
        r = client.post(f"/issues/{rid}/resolve", json={"root_cause": "Other"}, headers=auth(EMPLOYEE3))
        assert r.status_code == 200 and r.json()["status"] == "Resolved"
        # Reassigning issues and admin stay with staff.
        assert client.patch(f"/issues/{earlier}", json={"lead_id": users[LEAD]["id"]},
                            headers=auth(EMPLOYEE3)).status_code == 403
        assert client.get("/admin/users", headers=auth(EMPLOYEE3)).status_code == 403

    # Marek is back: Ola keeps rights only on the issue routed to her.
    r = client.get(f"/issues/{earlier}", headers=auth(EMPLOYEE3)).json()
    assert r["viewer_can_lead"] is False
    assert client.patch(f"/issues/{earlier}", json={"priority": "Low"}, headers=auth(EMPLOYEE3)).status_code == 403


def test_backup_without_absence_has_no_lead_rights(client, users, make_issue):
    iid = make_issue(title="Owner present", area="Improvements")["id"]
    with ola_covers_marek(client, users, absent=False):
        assert client.patch(f"/issues/{iid}", json={"priority": "High"}, headers=auth(EMPLOYEE3)).status_code == 403
        assert client.get(f"/issues/{iid}", headers=auth(EMPLOYEE)).json()["viewer_can_lead"] is False
