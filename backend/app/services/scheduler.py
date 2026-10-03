"""Background jobs (APScheduler) running inside the API process."""
import logging
import os
from datetime import UTC, datetime

from apscheduler.schedulers.background import BackgroundScheduler

from app.db import engine
from app.services.workflow import auto_close_due

log = logging.getLogger("ktasks.scheduler")


def run_auto_close() -> list[int]:
    with engine.begin() as conn:
        closed = auto_close_due(conn)
    if closed:
        log.info("Auto-closed issues: %s", closed)
    return closed


def start_scheduler() -> BackgroundScheduler | None:
    if os.environ.get("KTASKS_DISABLE_SCHEDULER") == "1":
        return None
    scheduler = BackgroundScheduler(timezone="UTC")
    # Run once at startup, then hourly. (next_run_time=None would add the job paused.)
    scheduler.add_job(run_auto_close, "interval", hours=1, id="auto_close", coalesce=True,
                      next_run_time=datetime.now(UTC))
    scheduler.start()
    return scheduler
