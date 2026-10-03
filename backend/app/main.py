from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import admin, blockers, comments, dashboard, issues, notifications, search, tasks, users
from app.services.scheduler import start_scheduler


@asynccontextmanager
async def lifespan(_: FastAPI):
    scheduler = start_scheduler()
    yield
    if scheduler:
        scheduler.shutdown(wait=False)


app = FastAPI(title="KTasks API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

for r in (users.router, search.router, issues.router, blockers.router, comments.router, tasks.router, admin.router,
          dashboard.router, notifications.router):
    app.include_router(r)


@app.get("/health")
def health():
    return {"status": "ok"}
