"""Step 5: tasks, templates, Kanban auto-sync, completion prompt, resolution and red alert."""
from tests.conftest import EMPLOYEE, EMPLOYEE2, LEAD, auth


def add_task(client, iid, title, email=LEAD, **kw):
    r = client.post(f"/issues/{iid}/tasks", json={"title": title, **kw}, headers=auth(email))
    assert r.status_code == 201, r.text
    return r.json()


def move(client, task_id, status, email=LEAD, **kw):
    r = client.patch(f"/tasks/{task_id}/move", json={"status": status, **kw}, headers=auth(email))
    assert r.status_code == 200, r.text
    return r.json()


def issue_of(client, iid):
    return client.get(f"/issues/{iid}", headers=auth(LEAD)).json()


def test_templates_lead_only_and_idempotent(client, make_issue):
    iid = make_issue(title="Templates")["id"]
    assert client.post(f"/issues/{iid}/tasks/from-templates", json={}, headers=auth(EMPLOYEE)).status_code == 403
    tasks = client.post(f"/issues/{iid}/tasks/from-templates", json={}, headers=auth(LEAD)).json()
    titles = [t["title"] for t in tasks]
    assert titles[:3] == ["Root cause analysis", "Fix implementation", "Fix testing"] and "SOP update" in titles
    assert all(t["status"] == "ToDo" for t in tasks)
    again = client.post(f"/issues/{iid}/tasks/from-templates", json={}, headers=auth(LEAD)).json()
    assert len(again) == len(tasks), "re-applying templates must not duplicate tasks"

    templates = client.get("/task-templates", headers=auth(EMPLOYEE)).json()
    iid2 = make_issue(title="Templates subset")["id"]
    subset = client.post(f"/issues/{iid2}/tasks/from-templates", json={"template_ids": [templates[0]["id"]]},
                         headers=auth(LEAD)).json()
    assert [t["title"] for t in subset] == [templates[0]["title"]]


def test_first_task_in_progress_starts_issue(client, make_issue):
    iid = make_issue(title="Auto start")["id"]
    t1, t2 = add_task(client, iid, "Investigate"), add_task(client, iid, "Fix")
    assert issue_of(client, iid)["status"] == "New"

    res = move(client, t1["id"], "InProgress")
    assert res["issue_started"] is True and res["issue_status"] == "In Progress" and res["completion_prompt"] is False
    issue = issue_of(client, iid)
    assert issue["status"] == "In Progress" and issue["start_date"] is not None
    start = issue["start_date"]

    res = move(client, t2["id"], "InProgress")
    assert res["issue_started"] is False
    assert issue_of(client, iid)["start_date"] == start, "start_date is recorded only once"

    log = [a for a in client.get(f"/issues/{iid}/activity", headers=auth(LEAD)).json()
           if a["action_type"] == "status_changed"]
    assert len(log) == 1 and log[0]["details"]["auto"] == "first task started"


def test_last_task_done_prompts_and_red_alert(client, make_issue):
    iid = make_issue(title="Completion prompt")["id"]
    t1, t2 = add_task(client, iid, "Task A"), add_task(client, iid, "Task B")
    move(client, t1["id"], "InProgress")
    assert move(client, t1["id"], "Done")["completion_prompt"] is False   # B still open
    res = move(client, t2["id"], "Done")
    assert res["completion_prompt"] is True

    # User answered NO and didn't add a task -> red alert.
    listed = {i["id"]: i for i in client.get("/issues", headers=auth(LEAD)).json()}
    assert listed[iid]["metrics"]["red_alert"] is True

    # Adding a To Do task clears it.
    add_task(client, iid, "Follow-up check")
    assert issue_of(client, iid)["metrics"]["red_alert"] is False


def test_resolve_requires_root_cause_and_done_tasks(client, make_issue, db):
    iid = make_issue(title="Resolve rules")["id"]
    t = add_task(client, iid, "Only task", assignee_id=None)
    assert client.post(f"/issues/{iid}/resolve", json={"root_cause": "Vendor"}, headers=auth(LEAD)).status_code == 409  # New
    move(client, t["id"], "InProgress")
    assert client.post(f"/issues/{iid}/resolve", json={"root_cause": "Vendor"}, headers=auth(LEAD)).status_code == 409  # open task
    move(client, t["id"], "Done")
    assert client.post(f"/issues/{iid}/resolve", json={}, headers=auth(LEAD)).status_code == 422
    assert client.post(f"/issues/{iid}/resolve", json={"root_cause": "Aliens"}, headers=auth(LEAD)).status_code == 422
    assert client.post(f"/issues/{iid}/resolve", json={"root_cause": "Vendor"}, headers=auth(EMPLOYEE2)).status_code == 403

    r = client.post(f"/issues/{iid}/resolve", json={"root_cause": "Vendor"}, headers=auth(LEAD))
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "Resolved" and body["root_cause"] == "Vendor" and body["resolved_at"]
    assert body["resolved_by_name"] == "Anna Nowak" and body["metrics"]["sla_state"] in ("met", "breached")

    # Creator gets a verification request.
    msgs = [r[0] for r in db.execute(
        "select n.message from public.notifications n join public.users u on u.id = n.user_id "
        "where u.email = %s and n.issue_id = %s and n.type = 'verification_request'", (EMPLOYEE, iid))]
    assert len(msgs) == 1 and "please confirm" in msgs[0]

    # Tasks are locked once resolved.
    assert client.patch(f"/tasks/{t['id']}/move", json={"status": "ToDo"}, headers=auth(LEAD)).status_code == 409
    assert client.post(f"/issues/{iid}/tasks", json={"title": "late"}, headers=auth(LEAD)).status_code == 409


def test_assignee_can_move_and_resolve(client, make_issue, users):
    iid = make_issue(title="Assignee rights")["id"]
    t = add_task(client, iid, "Calibrate", assignee_id=users[EMPLOYEE2]["id"])
    assert t["assignee_name"] == "Piotr Lewandowski"
    move(client, t["id"], "InProgress", email=EMPLOYEE2)
    assert move(client, t["id"], "Done", email=EMPLOYEE2)["completion_prompt"] is True
    r = client.post(f"/issues/{iid}/resolve", json={"root_cause": "IT/Equipment"}, headers=auth(EMPLOYEE2))
    assert r.status_code == 200 and r.json()["status"] == "Resolved"


def test_task_permissions(client, make_issue, users):
    iid = make_issue(title="Task perms")["id"]
    # Unrelated employee can't add/move/delete.
    assert client.post(f"/issues/{iid}/tasks", json={"title": "x y"}, headers=auth(EMPLOYEE2)).status_code == 403
    t = add_task(client, iid, "Creator task", email=EMPLOYEE)  # creator may add
    assert client.patch(f"/tasks/{t['id']}/move", json={"status": "Done"}, headers=auth(EMPLOYEE2)).status_code == 403
    assert client.delete(f"/tasks/{t['id']}", headers=auth(EMPLOYEE2)).status_code == 403
    assert client.post(f"/issues/{iid}/tasks", json={"title": "bad", "assignee_id": "00000000-0000-0000-0000-000000000000"},
                       headers=auth(LEAD)).status_code == 422
    assert client.delete(f"/tasks/{t['id']}", headers=auth(LEAD)).status_code == 204
    assert client.get(f"/tasks?issue_id={iid}", headers=auth(LEAD)).json() == []


def test_swimlane_move_reassigns(client, make_issue, users):
    iid = make_issue(title="Swimlanes")["id"]
    t = add_task(client, iid, "Lane task", assignee_id=users[EMPLOYEE]["id"])
    res = move(client, t["id"], "InProgress", assignee_id=users[EMPLOYEE2]["id"])
    assert res["task"]["assignee_name"] == "Piotr Lewandowski"
    all_tasks = client.get("/tasks", headers=auth(EMPLOYEE)).json()
    mine = next(x for x in all_tasks if x["id"] == t["id"])
    assert mine["issue_title"].endswith("Swimlanes") and mine["issue_status"] == "In Progress"


def test_concurrent_last_moves_still_prompt(client, make_issue):
    """Two tasks finished at the same time: exactly one move must report the completion prompt."""
    from concurrent.futures import ThreadPoolExecutor

    iid = make_issue(title="Concurrent finish")["id"]
    tasks = [add_task(client, iid, f"Parallel {n}") for n in range(3)]
    for t in tasks:
        move(client, t["id"], "InProgress")
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda t: move(client, t["id"], "Done"), tasks))
    assert sum(r["completion_prompt"] for r in results) == 1
