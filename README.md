# KTasks: Issue & Improvement Management (AstraZeneca Pharma)

KTasks is an internal tool for reporting operational issues, routing them to the responsible Lead, working them on a Kanban board, and closing the loop with the reporter. Everything is measured against business-day SLAs.

| Layer | Stack |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy Core + psycopg 3, APScheduler, openpyxl, reportlab |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4, shadcn/ui (Base UI), TanStack Query, dnd-kit |
| Data | Supabase PostgreSQL + Supabase Storage (private `issue-attachments` bucket), Supabase Auth |
| Email | Resend |

## Features

- **Issues tab**
  - The report form searches for duplicates as you type (trigram similarity) and offers "Join existing thread".
  - Attachments upload to Supabase Storage.
  - Issues route to the Lead for their area, or to that Lead's backup while the Lead is absent.
  - The issue table shows SLA badges and a **BLOCKED** badge.
  - A row turns red when an issue is In Progress but has no scheduled tasks.
  - The drawer shows the SLA breakdown, Lead controls, blockers, attachments and a full audit log.
- **Discussions tab**
  - Slack-style layout: an inbox with unread counts on the left, the chat on the right.
  - Only the author can edit a comment.
  - Each comment notifies the reporter, the Lead and everyone in the thread.
- **Work tab**
  - A focused Kanban for one issue, plus a global board with a swimlane per assignee.
  - Leads can add standard tasks in one click from templates.
  - Status sync:
    - Moving the first task to In Progress sets the issue to In Progress and records `start_date`.
    - Moving the last task to Done asks *"Are all works on this issue completed?"*. **Yes** requires a root cause and resolves the issue. **No** requires a new To Do task.
- **Two-stage closure**
  - Only the reporter can confirm a resolution. Confirming records `closed_by_user_id` and `closed_at`.
  - Unconfirmed resolutions close automatically after **5 business days**, via an hourly job.
- **Rejection**
  - A Lead can reject a New or In Progress issue from the drawer. A written reason is mandatory.
  - The reporter and the thread participants are notified and see the reason.
  - Rejected is final: the issue is locked and drops out of open lists, discussions, Kanban and SLA compliance. You can still find it with the *Rejected* status filter.
- **Deleting issues**
  - The reporter or the Lead assigned to the issue can delete it from the drawer, optionally giving a reason. No one else can.
  - This is a soft delete: the issue disappears from the whole app, but the database keeps the row, who deleted it and when, for audit.
  - Closed issues cannot be deleted.
- **Accounts**
  - Anyone can self-register at `/register`. New accounts are always **Employees**.
    - `ALLOWED_SIGNUP_DOMAINS` in `.env` can limit sign-up to company domains.
  - Leads manage everyone under **User menu → User management**:
    - add users with a chosen or generated one-time password
    - promote or demote Leads
    - reset passwords
    - deactivate and reactivate accounts (deactivated users can't sign in)
  - An area Lead must be replaced in Lead settings before they can be demoted or deactivated.
- **Dashboard tab**
  - KPIs: average Lead response time, open issues, SLA compliance, time lost to blockers.
  - Charts: a Quick Wins matrix (priority × effort), the root-cause distribution, and the top blocker reasons.
  - Every chart can switch to a table view.
  - Reports export as **PDF** or **Excel**.
- **App-wide**
  - **Ctrl/Cmd + K** search across issues, tasks and discussions.
  - A notification bell, plus email alerts to Leads through Resend.
  - Lead settings: assign Leads to areas, mark absences, set backup Leads.

### Business rules

- **Business days:** weekends are excluded, in the `APP_TIMEZONE` timezone (default Europe/Warsaw). On a weekday the clock runs the full 24 hours. Saturdays and Sundays count as zero.
- **SLA target by priority:** Critical 2, High 5, Medium 10, Low 20 business days, configurable in `backend/app/config.py`. The SLA badge reads **At risk** once 75% of the target is used.
- **Blocker time:** the total covered by an issue's blockers, with overlaps counted once. **Active work** is cycle time minus blocked time.
- **Lead response time:** business time from creation to the assigned Lead's first action on the issue (a comment, task, status change, etc.).

## Setup

Prerequisites: Python 3.12 and Node.js 20.9 or newer.

1. Copy `.env.example` to `.env` and fill it in.
   - The Supabase direct DB host is IPv6-only, so use the **Session pooler** connection string for `DATABASE_URL`.
   - Resend's sandbox sender (`onboarding@resend.dev`) only delivers to the Resend account owner. Set `EMAIL_OVERRIDE_TO` to that address during development.
2. Set up the backend:
   ```bash
   cd backend
   py -3.12 -m venv .venv
   .venv/Scripts/python -m pip install -r requirements-dev.txt
   .venv/Scripts/python scripts/migrate.py   # tables, indexes, storage bucket, RLS (idempotent)
   .venv/Scripts/python scripts/seed.py      # demo accounts + area-lead routing (idempotent)
   .venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
   ```
3. Set up the frontend. Create `frontend/.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_API_URL=http://localhost:8000`, then:
   ```bash
   cd frontend
   npm install
   npm run dev        # http://localhost:3000
   ```

Demo accounts all share the `SEED_PASSWORD` from `.env`:

| Account | Role |
|---|---|
| `anna.lead@ktasks.dev` | Lead (Operations, Process) |
| `marek.lead@ktasks.dev` | Lead (Improvements), Anna's backup |
| `kasia@ktasks.dev`, `piotr@ktasks.dev`, `ola@ktasks.dev` | Employees |

## Tests

```bash
cd backend && .venv/Scripts/python -m pytest          # unit + API tests against the Supabase DB
cd frontend && npm run lint && npm run build && npx playwright test   # starts both servers automatically
```

- Test data is tagged in its titles (`[pytest]`, `[e2e]`) and removed automatically by `backend/scripts/cleanup_test_data.py`.
- The backend scheduler is disabled during pytest (`KTASKS_DISABLE_SCHEDULER=1`).

## Architecture notes

- **Access:** the FastAPI backend is the only data path. RLS is enabled on every table with no policies, and the Data API roles have no privileges.
  - The browser uses Supabase only to sign in.
  - The API verifies the ES256 access token against the project JWKS.
- **Concurrency:** workflow endpoints lock the issue row (`SELECT … FOR UPDATE`). Simultaneous task moves therefore can't skip the completion prompt.
- **Commit timing:** the DB dependency runs with `scope="function"`, so each transaction commits before the response is sent.
- **Security:** `PROMPT.md` and `.env` contain secrets and are gitignored. Rotate the Supabase and Resend keys if they were ever shared.
