from typing import Literal

from fastapi import APIRouter, Query, Response

from app.deps import DB, CurrentUser
from app.schemas.users import Area
from app.services.access import Visibility
from app.services.dashboard import build_dashboard
from app.services.reports import to_pdf, to_xlsx
from app.services.sla import now

router = APIRouter(tags=["dashboard"])

Days = Query(None, ge=1, le=3650, description="Only issues created in the last N days")


@router.get("/dashboard")
def dashboard(db: DB, user: CurrentUser, area: Area | None = None, days: int | None = Days,
              visibility: Visibility = "all"):
    data = build_dashboard(db, area, days, viewer=user, visibility=visibility)
    data.pop("issues")
    return data


@router.get("/reports/export")
def export(db: DB, user: CurrentUser, format: Literal["xlsx", "pdf"] = "xlsx",  # noqa: A002
           area: Area | None = None, days: int | None = Days, visibility: Visibility = "all"):
    data = build_dashboard(db, area, days, viewer=user, visibility=visibility)
    stamp = now().strftime("%Y%m%d-%H%M")
    if format == "pdf":
        body, media = to_pdf(data), "application/pdf"
    else:
        body, media = to_xlsx(data), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return Response(body, media_type=media,
                    headers={"Content-Disposition": f'attachment; filename="ktasks-report-{stamp}.{format}"'})
