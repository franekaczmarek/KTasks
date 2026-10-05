from typing import Literal
from uuid import UUID

from pydantic import BaseModel

Area = Literal["Operations", "Process", "Improvements", "Management"]
Role = Literal["employee", "lead", "director"]


class UserOut(BaseModel):
    id: UUID
    email: str
    name: str
    role: Role
    backup_lead_id: UUID | None
    is_absent: bool
    is_active: bool = True


class UserPatch(BaseModel):
    is_absent: bool | None = None
    backup_lead_id: UUID | None = None


class AreaLeadOut(BaseModel):
    area: Area
    lead_id: UUID
    lead_name: str
    lead_absent: bool
    effective_lead_id: UUID
    effective_lead_name: str


class AreaLeadIn(BaseModel):
    lead_id: UUID
