"""Step 4: discussions inbox, comment edit rules, unread counts and notification fan-out."""
from tests.conftest import EMPLOYEE, EMPLOYEE2, LEAD, LEAD2, auth

OLA = "ola@ktasks.dev"


def notified(db, issue_id, type_="comment"):
    return sorted(r[0] for r in db.execute(
        "select u.email from public.notifications n join public.users u on u.id = n.user_id "
        "where n.issue_id = %s and n.type = %s", (issue_id, type_)))


def inbox_entry(client, email, issue_id):
    return next(d for d in client.get("/discussions", headers=auth(email)).json() if d["id"] == issue_id)


def test_comment_notifies_creator_lead_and_participants(client, make_issue, db):
    issue = make_issue(title="Chat fan-out")  # creator Kasia, lead Anna
    iid = issue["id"]

    r = client.post(f"/issues/{iid}/comments", json={"content": "Looking into it"}, headers=auth(LEAD))
    assert r.status_code == 201 and r.json()["user_name"] == "Anna Nowak" and r.json()["is_edited"] is False
    assert notified(db, iid) == [EMPLOYEE]  # author (lead) excluded

    # A new commenter becomes a participant; everyone else is notified.
    client.post(f"/issues/{iid}/comments", json={"content": "Same on my shift"}, headers=auth(EMPLOYEE2))
    assert notified(db, iid) == sorted([EMPLOYEE, EMPLOYEE, LEAD])

    client.post(f"/issues/{iid}/comments", json={"content": "Thanks!"}, headers=auth(EMPLOYEE))
    assert notified(db, iid).count(EMPLOYEE2) == 1 and notified(db, iid).count(LEAD) == 2
    # Non-participants are never notified.
    assert OLA not in notified(db, iid) and LEAD2 not in notified(db, iid)

    r = client.get(f"/issues/{iid}/comments", headers=auth(OLA))
    assert r.status_code == 200, r.text
    comments = r.json()
    assert [c["content"] for c in comments] == ["Looking into it", "Same on my shift", "Thanks!"]


def test_only_author_can_edit(client, make_issue):
    iid = make_issue(title="Edit rules")["id"]
    cid = client.post(f"/issues/{iid}/comments", json={"content": "typo hre"}, headers=auth(EMPLOYEE)).json()["id"]

    assert client.patch(f"/comments/{cid}", json={"content": "hijack"}, headers=auth(LEAD)).status_code == 403
    assert client.patch(f"/comments/{cid}", json={"content": "hijack"}, headers=auth(EMPLOYEE2)).status_code == 403
    assert client.patch(f"/comments/{cid}", json={"content": "   "}, headers=auth(EMPLOYEE)).status_code == 422
    assert client.patch("/comments/999999999", json={"content": "x"}, headers=auth(EMPLOYEE)).status_code == 404

    r = client.patch(f"/comments/{cid}", json={"content": "typo here"}, headers=auth(EMPLOYEE))
    assert r.status_code == 200 and r.json()["content"] == "typo here" and r.json()["is_edited"] is True


def test_unread_counts_and_mark_read(client, make_issue):
    iid = make_issue(title="Unread tracking")["id"]
    client.post(f"/issues/{iid}/comments", json={"content": "one"}, headers=auth(LEAD))
    client.post(f"/issues/{iid}/comments", json={"content": "two"}, headers=auth(LEAD))

    entry = inbox_entry(client, EMPLOYEE, iid)
    assert entry["unread_count"] == 2 and entry["last_comment"] == "two" and entry["last_comment_by"] == "Anna Nowak"
    assert inbox_entry(client, LEAD, iid)["unread_count"] == 0  # own comments are never unread
    assert inbox_entry(client, OLA, iid)["unread_count"] == 0   # not a participant

    assert client.post(f"/issues/{iid}/read", headers=auth(EMPLOYEE)).status_code == 204
    assert inbox_entry(client, EMPLOYEE, iid)["unread_count"] == 0


def test_inbox_sorted_by_recent_activity(client, make_issue):
    older = make_issue(title="Older thread")["id"]
    newer = make_issue(title="Newer thread")["id"]
    client.post(f"/issues/{older}/comments", json={"content": "bump"}, headers=auth(EMPLOYEE))
    ids = [d["id"] for d in client.get("/discussions", headers=auth(EMPLOYEE)).json()]
    assert ids.index(older) < ids.index(newer)


def test_comment_validation(client, make_issue):
    iid = make_issue(title="Validation")["id"]
    assert client.post(f"/issues/{iid}/comments", json={"content": ""}, headers=auth(EMPLOYEE)).status_code == 422
    assert client.post(f"/issues/{iid}/comments", json={"content": "  "}, headers=auth(EMPLOYEE)).status_code == 422
    assert client.post("/issues/999999999/comments", json={"content": "x"}, headers=auth(EMPLOYEE)).status_code == 404
