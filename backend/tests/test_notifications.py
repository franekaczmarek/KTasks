"""Step 8: notification feed, read state isolation, and email rendering/override."""
from app.services import email as email_service
from tests.conftest import EMPLOYEE, EMPLOYEE2, LEAD, auth

# The autouse `sent_emails` fixture stubs send_email; keep the real one for these unit tests.
REAL_SEND = email_service.send_email


def feed(client, who, **params):
    r = client.get("/notifications", params=params, headers=auth(who))
    assert r.status_code == 200
    return r.json()


def test_feed_read_and_read_all(client, make_issue):
    client.post("/notifications/read-all", headers=auth(LEAD))
    assert feed(client, LEAD)["unread_count"] == 0

    a = make_issue(title="Bell one")["id"]
    make_issue(title="Bell two")
    f = feed(client, LEAD)
    assert f["unread_count"] == 2
    newest = f["items"][0]
    assert newest["type"] == "issue_assigned" and "Bell two" in newest["message"]
    assert newest["link"].startswith("/issues?issue=") and newest["read_status"] is False

    # Another user can neither see nor mark it.
    assert all(i["id"] != newest["id"] for i in feed(client, EMPLOYEE2)["items"])
    assert client.post(f"/notifications/{newest['id']}/read", headers=auth(EMPLOYEE2)).status_code == 404

    assert client.post(f"/notifications/{newest['id']}/read", headers=auth(LEAD)).status_code == 204
    f = feed(client, LEAD)
    assert f["unread_count"] == 1 and f["items"][0]["read_status"] is True
    assert [i["issue_id"] for i in feed(client, LEAD, unread_only=True)["items"]] == [a]

    assert client.post("/notifications/read-all", headers=auth(LEAD)).status_code == 204
    assert feed(client, LEAD)["unread_count"] == 0


def test_feed_requires_auth(client):
    assert client.get("/notifications").status_code == 401


def test_comment_triggers_bell_for_reporter(client, make_issue):
    client.post("/notifications/read-all", headers=auth(EMPLOYEE))
    iid = make_issue(title="Bell comment")["id"]
    client.post(f"/issues/{iid}/comments", json={"content": "Need photos please"}, headers=auth(LEAD))
    f = feed(client, EMPLOYEE)
    assert f["unread_count"] == 1
    assert f["items"][0]["type"] == "comment" and f["items"][0]["link"] == f"/discussions?issue={iid}"


def test_email_template_escapes_and_links():
    html = email_service.render("New <b>issue</b>", "Body & <script>", "/issues?issue=5")
    assert "&lt;b&gt;issue&lt;/b&gt;" in html and "&lt;script&gt;" in html
    assert 'href="http://localhost:3000/issues?issue=5"' in html and "#00205B" in html


def test_send_email_uses_override(monkeypatch):
    calls = []

    class FakeResponse:
        status_code, text = 200, "{}"

    monkeypatch.setattr(email_service.httpx, "post", lambda url, **kw: calls.append(kw["json"]) or FakeResponse())
    settings = email_service.get_settings()
    monkeypatch.setattr(settings, "resend_api_key", "re_test")
    monkeypatch.setattr(settings, "email_override_to", "owner@example.com")
    assert REAL_SEND(["lead@example.com"], "Subj", "Body", "/x") is True
    assert calls[0]["to"] == ["owner@example.com"] and calls[0]["subject"] == "Subj"

    monkeypatch.setattr(settings, "email_override_to", "")
    REAL_SEND(["lead@example.com"], "Subj", "Body")
    assert calls[1]["to"] == ["lead@example.com"]


def test_send_email_never_raises(monkeypatch):
    def boom(*a, **kw):
        raise email_service.httpx.ConnectError("down")

    monkeypatch.setattr(email_service.httpx, "post", boom)
    monkeypatch.setattr(email_service.get_settings(), "resend_api_key", "re_test")
    assert REAL_SEND(["x@example.com"], "s", "b") is False
