"""Who may see an issue and who may act as its Lead.

Staff (Leads and Directors) see every issue. A hidden issue is invisible to other users unless they are
involved: its reporter, its owner (lead_id, which may be an employee backup through routing), an
assignee of one of its tasks, or - when the issue is marked visible_to_backup - the backup of its owner.
"""
from typing import Any, Literal

STAFF_ROLES = ("lead", "director")
Visibility = Literal["all", "hidden", "visible"]


def is_staff(user: dict[str, Any]) -> bool:
    return user["role"] in STAFF_ROLES


def involved_sql(viewer: str, alias: str = "i") -> str:
    """SQL boolean: `viewer` (a bind param or column expression) may see issue `alias`, ignoring role."""
    a = alias
    return f"""(not {a}.is_hidden or {a}.creator_id = {viewer} or {a}.lead_id = {viewer}
        or exists (select 1 from public.tasks vt where vt.issue_id = {a}.id and vt.assignee_id = {viewer})
        or ({a}.visible_to_backup and exists (
            select 1 from public.users vo where vo.id = {a}.lead_id and vo.backup_lead_id = {viewer})))"""


def visible_sql(user: dict[str, Any], alias: str = "i", choice: Visibility = "all") -> str:
    """SQL boolean for issues `user` may see; bind `viewer=user["id"]`. Staff may narrow by hidden state."""
    if not is_staff(user):
        return involved_sql(":viewer", alias)
    return {"all": "true", "hidden": f"{alias}.is_hidden", "visible": f"not {alias}.is_hidden"}[choice]


def can_lead_issue(user: dict[str, Any], issue: dict[str, Any]) -> bool:
    """Lead-level rights on one issue: staff, the issue's owner, or the owner's backup while the owner is absent.

    `issue` must carry lead_backup_id / lead_absent (see issue_or_404 and load_issues) and be visible to `user`.
    """
    me = str(user["id"])
    if is_staff(user) or str(issue["lead_id"]) == me:
        return True
    return bool(issue.get("lead_absent")) and str(issue.get("lead_backup_id")) == me
