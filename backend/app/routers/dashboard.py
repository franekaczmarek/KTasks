from typing import Literal

from fastapi import APIRouter, Query, Response

from app.deps import DB, CurrentUser
from app.schemas.users import Area
from app.services.dashboard import build_dashboard
from app.services.reports import to_pdf, to_xlsx
from app.services.sla import now

router = APIRouter(tags=["dashboard"])

Days = Query(None, ge=1, le=3650, description="Only issues created in the last N days")


@router.get("/dashboard")
def dashboard(db: DB, _: CurrentUser, area: Area | None = None, days: int | None = Days):
    data = build_dashboard(db, area, days)
    data.pop("issues")
    return data


@router.get("/reports/export")
def export(db: DB, _: CurrentUser, format: Literal["xlsx", "pdf"] = "xlsx",  # noqa: A002
           area: Area | None = None, days: int | None = Days):
    data = build_dashboard(db, area, days)
    stamp = now().strftime("%Y%m%d-%H%M")
    if format == "pdf":
        body, media = to_pdf(data), "application/pdf"
    else:
        body, media = to_xlsx(data), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return Response(body, media_type=media,
                    headers={"Content-Disposition": f'attachment; filename="ktasks-report-{stamp}.{format}"'})
