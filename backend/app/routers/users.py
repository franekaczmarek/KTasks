from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.db import execute, fetch_all, fetch_one
from app.deps import DB, CurrentUser, StaffUser
from app.schemas.users import Area, AreaLeadIn, AreaLeadOut, UserOut, UserPatch
from app.services.access import is_staff
from app.services.routing import area_leads

router = APIRouter(tags=["users"])

_USER_COLS = "id, email, name, role, backup_lead_id, is_absent, is_active"


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.get("/users", response_model=list[UserOut])
def list_users(db: DB, _: CurrentUser):
    return fetch_all(db, f"""select {_USER_COLS} from public.users
                            order by case role when 'director' then 0 when 'lead' then 1 else 2 end, name""")


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: UUID, body: UserPatch, db: DB, _: StaffUser):
    target = fetch_one(db, f"select {_USER_COLS} from public.users where id = :id", id=user_id)
    if target is None:
        raise HTTPException(404, "User not found")
    changes = body.model_dump(exclude_unset=True)
    if "backup_lead_id" in changes and changes["backup_lead_id"] is not None:
        if changes["backup_lead_id"] == user_id:
            raise HTTPException(422, "A user cannot be their own backup lead")
        # Any active user may stand in: an employee backup acts as Lead on the owner's issues while they're absent.
        backup = fetch_one(db, "select is_active from public.users where id = :id", id=changes["backup_lead_id"])
        if backup is None or not backup["is_active"]:
            raise HTTPException(422, "Backup must be an active user")
    if changes:
        sets = ", ".join(f"{k} = :{k}" for k in changes)
        execute(db, f"update public.users set {sets} where id = :id", id=user_id, **changes)
    return fetch_one(db, f"select {_USER_COLS} from public.users where id = :id", id=user_id)


@router.get("/area-leads", response_model=list[AreaLeadOut])
def get_area_leads(db: DB, _: CurrentUser):
    return area_leads(db)


@router.put("/area-leads/{area}", response_model=list[AreaLeadOut])
def set_area_lead(area: Area, body: AreaLeadIn, db: DB, _: StaffUser):
    lead = fetch_one(db, "select role from public.users where id = :id", id=body.lead_id)
    if area == "Management":
        if lead is None or lead["role"] != "director":
            raise HTTPException(422, "The Management area must be owned by a Director")
    elif lead is None or not is_staff(lead):
        raise HTTPException(422, "Area lead must be a Lead or a Director")
    execute(
        db,
        "insert into public.area_leads (area, lead_id) values (:area, :lead_id) "
        "on conflict (area) do update set lead_id = excluded.lead_id",
        area=area, lead_id=body.lead_id,
    )
    return area_leads(db)
