from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import blockers, comments, issues, search, users

app = FastAPI(title="KTasks API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

for r in (users.router, search.router, issues.router, blockers.router, comments.router):
    app.include_router(r)


@app.get("/health")
def health():
    return {"status": "ok"}
