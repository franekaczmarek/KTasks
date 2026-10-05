"""Self-registration (employees) and the Lead admin panel for user accounts."""
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, Field

from app.db import execute, fetch_all, fetch_one
from app.deps import DB, CurrentUser, StaffUser
from app.schemas.users import Role
from app.services.accounts import (
    check_signup_domain, create_account, generate_password, set_active, update_auth_user, verify_password,
)

router = APIRouter(tags=["accounts"])

_ADMIN_USER_SELECT = """
    select u.id, u.email, u.name, u.role, u.backup_lead_id, u.is_absent, u.is_active, u.created_at,
           coalesce((select array_agg(a.area order by a.area) from public.area_leads a where a.lead_id = u.id),
                    '{}') as lead_of_areas,
           (select count(*) from public.users b where b.backup_lead_id = u.id) as backup_for_count
    from public.users u
"""


class RegisterIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=8, max_length=72)


class AdminCreateIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=2, max_length=100)
    role: Role = "employee"
    password: str | None = Field(None, min_length=8, max_length=72)


class AdminPatchIn(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)
    role: Role | None = None
    is_active: bool | None = None


class PasswordIn(BaseModel):
    password: str | None = Field(None, min_length=8, max_length=72)


@router.post("/auth/register", status_code=201)
def register(body: RegisterIn, db: DB):
    """Public self-registration. New accounts are always employees; Leads can promote them later."""
    check_signup_domain(body.email)
    return create_account(db, body.email, body.name, "employee", body.password)


@router.get("/admin/users")
def admin_list_users(db: DB, _: StaffUser):
    return fetch_all(db, f"{_ADMIN_USER_SELECT} order by u.is_active desc, u.role desc, u.name")


@router.post("/admin/users", status_code=201)
def admin_create_user(body: AdminCreateIn, db: DB, admin: StaffUser):
    if body.role == "director":
        _require_director(admin)
    password = body.password or generate_password()
    user = create_account(db, body.email, body.name, body.role, password)
    # The password is shown once so the Lead can hand it over; it is never stored by KTasks.
    return {"user": user, "temporary_password": None if body.password else password}


def _admin_user(db, user_id) -> dict:
    user = fetch_one(db, f"{_ADMIN_USER_SELECT} where u.id = :id", id=user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    return user


def _require_director(admin: dict) -> None:
    if admin["role"] != "director":
        raise HTTPException(403, "Only a Director can grant the Director role or manage Director accounts")


def _ensure_not_area_owner(target: dict, action: str, areas: list[str] | None = None) -> None:
    """An area owner must be replaced in Lead settings first."""
    owned = [a for a in target["lead_of_areas"] if areas is None or a in areas]
    if owned:
        raise HTTPException(409, f"{target['name']} owns {', '.join(owned)}. "
                                 f"Assign someone else to that area before you {action}.")


@router.patch("/admin/users/{user_id}")
def admin_update_user(user_id: UUID, body: AdminPatchIn, db: DB, admin: StaffUser):
    target = _admin_user(db, user_id)
    changes = body.model_dump(exclude_unset=True)
    is_self = str(user_id) == str(admin["id"])
    if is_self and (("role" in changes and changes["role"] != target["role"]) or changes.get("is_active") is False):
        raise HTTPException(409, "You cannot change the role of, or deactivate, your own account")
    if target["role"] == "director" or changes.get("role") == "director":
        _require_director(admin)

    new_role = changes.get("role", target["role"])
    if new_role == "employee" and target["role"] != "employee":
        _ensure_not_area_owner(target, "demote them")
    elif target["role"] == "director" and new_role != "director":
        _ensure_not_area_owner(target, "change their role", ["Management"])
    if changes.get("is_active") is False and target["is_active"]:
        _ensure_not_area_owner(target, "deactivate them")
        # Nobody can stand in through an inactive account.
        execute(db, "update public.users set backup_lead_id = null where backup_lead_id = :id", id=user_id)

    if "name" in changes:
        execute(db, "update public.users set name = :n where id = :id", n=changes["name"].strip(), id=user_id)
    if "role" in changes:
        execute(db, "update public.users set role = :r where id = :id", r=changes["role"], id=user_id)
    if "is_active" in changes and changes["is_active"] != target["is_active"]:
        set_active(db, str(user_id), changes["is_active"])
    return _admin_user(db, user_id)


@router.post("/admin/users/{user_id}/reset-password")
def admin_reset_password(user_id: UUID, body: PasswordIn, db: DB, admin: StaffUser):
    if _admin_user(db, user_id)["role"] == "director":
        _require_director(admin)
    password = body.password or generate_password()
    update_auth_user(str(user_id), password=password)
    return {"temporary_password": None if body.password else password}


class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=72)
    new_password: str = Field(min_length=8, max_length=72)


@router.post("/me/password", status_code=204)
def change_own_password(body: ChangePasswordIn, user: CurrentUser):
    """Signed-in user changes their own password; the current one must be confirmed first."""
    if body.new_password == body.current_password:
        raise HTTPException(422, "The new password must be different from the current one")
    if not verify_password(user["email"], body.current_password):
        raise HTTPException(403, "Current password is incorrect")
    update_auth_user(str(user["id"]), password=body.new_password)
