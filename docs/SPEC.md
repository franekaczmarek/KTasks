# ASTRAZENECA PHARMA - ISSUE & IMPROVEMENT MANAGEMENT SYSTEM
## EXECUTIVE INSTRUCTION FOR CLAUDE CODE (PLAN & EXECUTE)

---

### 1. ENVIRONMENT

Secrets live in `.env` (gitignored). See `.env.example` for the required variables.

---

### 2. PRINCIPLES OF OPERATION & WORKFLOW FOR CLAUDE CODE

1. **PLANNING PHASE FIRST (Plan & Execute):**
   - Before writing any code, analyze this entire document, propose a detailed execution plan split into logical stages.
   - Begin coding step-by-step only after the execution plan has been explicitly approved.

2. **TOKEN EFFICIENCY & PROMPT CACHING:**
   - Optimize all interactions for maximum token efficiency.
   - Utilize file structures and workflows designed for **Prompt Caching**.
   - Avoid re-printing large entire files in conversation responses when modifying single functions or components.

3. **MANDATORY TESTING & VERIFICATION:**
   - **EVERY** created feature, backend API endpoint, and UI component MUST be thoroughly tested and verified in the local environment.
   - Do NOT leave placeholder mocks or untested code. Every feature must run stably and without errors in the browser or terminal console.

4. **FEATURE-BY-FEATURE GIT COMMITS:**
   - The entire project must be strictly managed using Git version control.
   - After successfully implementing and testing each individual feature, create a clean, atomic Git commit (e.g., `git commit -m "feat(database): initialize postgres schema and migrations"`).

5. **ARCHITECTURAL FLEXIBILITY:**
   - You are explicitly authorized to adapt technical implementation details, database structures, or library choices if required for stability, performance, or framework best practices, as long as core business goals are preserved.

---

### 3. TECH STACK & DESIGN SYSTEM (AstraZeneca Pharma)

- **Backend:** Python (FastAPI) with custom business-day calculation algorithms.
- **Frontend:** React (Next.js App Router) + Tailwind CSS + shadcn/ui.
- **Brand Theme (AstraZeneca Pharma):**
  - **Primary Navy:** `#00205B` (Main navigation, page headers, primary buttons).
  - **Accent Berry/Magenta:** `#D0006F` / `#830051` (Highlights, active tabs, badges, notifications).
  - **Background & Cards:** Clean light gray background (`#F4F5F7`), cards with rounded corners (`rounded-2xl`), subtle shadows (`shadow-sm` / `shadow-md`), and spacious padding layout.
  - **Badges & Pills:** Pill-shaped tags (`rounded-full`) using high-contrast pastel variants.
- **Database & Storage:** Supabase PostgreSQL + Supabase Storage (for issue attachments/screenshots).
- **Emailing:** Resend API.

---

### 4. DATABASE SCHEMA (Supabase PostgreSQL)

1. **`users`**: `id`, `email`, `name`, `role` (`'employee'` / `'lead'`), `backup_lead_id`.
2. **`issues`**: `id`, `title`, `summary`, `area` (`'Operations'`, `'Process'`, `'Improvements'`), `priority` (`'Low'`, `'Medium'`, `'High'`, `'Critical'`), `effort` (`'Low'`, `'Medium'`, `'High'`), `root_cause` (`'Procedure'`, `'Human Error'`, `'IT/Equipment'`, `'Training'`, `'Vendor'`, `'Other'`), `status` (`'New'`, `'In Progress'`, `'Resolved'`, `'Closed'`), `created_at`, `start_date`, `expected_end_date`, `creator_id`, `lead_id`, `closed_by_user_id`, `closed_at`.
3. **`blockers`**: `id`, `issue_id`, `reason`, `created_at`, `resolved_at`, `created_by_user_id`, `is_active` (`boolean`).
4. **`tasks`**: `id`, `issue_id`, `title`, `summary`, `status` (`'ToDo'`, `'InProgress'`, `'Done'`), `assignee_id`.
5. **`comments`**: `id`, `issue_id`, `user_id`, `content`, `created_at`, `is_edited` (`boolean`).
6. **`notifications`**: `id`, `user_id`, `type`, `message`, `read_status` (`boolean`), `created_at`.
7. **`activity_log`**: `id`, `issue_id`, `user_id`, `action_type`, `details`, `created_at`.

---

### 5. DETAILED FEATURES & BUSINESS LOGIC

#### A. Tab 1: Issues List, SLA, Blocker Guard & Drawer
- **Anti-Duplicate Guard:** While the user types the title of a new issue, the system searches existing open issues in real time and suggests joining an existing thread if duplicates are found.
- **Issue Submission Form:** Fields: Title, Summary, Attachments (uploaded to Supabase Storage), Area, Priority, Estimated Effort (`Low`, `Medium`, `High`). Submitting sends an email and in-app notification to the assigned Lead/Backup Lead.
- **Compact Table:** Columns: `ID`, `Title`, `Area`, `Priority`, `Status`, `Lead`, `SLA Badge`.
- **Business Days SLA Logic:** Calculates lead time and cycle time strictly using working business days (excluding Saturdays and Sundays). The clock runs continuously until work completion.
- **Blocker System:** Allows adding/resolving blockers with precise timestamps (`created_at`, `resolved_at`). Active blockers display a prominent `BLOCKED` status badge in the table and Kanban board. Total blocker duration is calculated as an independent metric (*Active Work Time vs Blocker Time*).
- **Red Alert Rule:** If an issue is marked `In Progress`, but all its associated Kanban tasks are in `Done` and no new task exists in `To Do`, the table row highlights in red (*"No scheduled tasks in progress"*).
- **Drawer (Side Panel):** Clicking a table row opens a slide-over panel showing full SLA breakdowns, blocker metrics, descriptions, attachments, and an **Audit Log / Activity History** tab (chronological log of status changes, date edits, reassignments, and closures with exact user attribution).

#### B. Tab 2: Communications Center (Discussions)
- **Inbox / Slack-Style Layout:**
  - *Left Column:* List of active issues sorted by recent activity, displaying a preview of the last comment and an unread message indicator.
  - *Right Column:* Chat interface for the selected issue. Users can edit *only their own* comments.
- **In-App Notifications:** Adding a comment triggers in-app notifications for the issue creator, assigned Lead, and all participating commenters in that thread.

#### C. Tab 4: Work, Kanban & Task Templates
- **View Toggle:**
  - *View A (Focused):* Issue selector dropdown -> Kanban board (`To Do`, `In Progress`, `Done`) displaying action items/tasks for that specific issue.
  - *View B (Global):* Kanban board showing ALL tasks across the application, grouped into horizontal swimlanes by assigned employee.
- **Task Templates:** One-click button for Leads to populate standard action items into `To Do` (e.g., *Root cause analysis*, *Fix testing*, *SOP update*).
- **Auto-Sync Logic:**
  - Moving the first task to `In Progress` -> Main Issue status automatically changes to `In Progress` and records `start_date`.
  - Moving the last remaining task to `Done` -> A confirmation modal appears asking: *"Are all works on this issue completed?"*:
    - **YES:** Requires selecting a **Root Cause** category and changes main Issue status to `Resolved`.
    - **NO:** Requires adding a new task to `To Do` (failure to add one triggers the Red Alert state).

#### D. Two-Stage Closure (Close-Loop & Accountability)
- Setting status to `Resolved` triggers a verification request notification to the submitting employee.
- **Employee Confirmation:** Clicking *"Confirm Resolution"* updates the database:
  - `status = Closed`
  - `closed_by_user_id = [Employee User ID]`
  - `closed_at = [Timestamp]`
  - Logs action in `activity_log` for full managerial auditability.
- **Auto-Close:** If the employee does not respond within 5 business days, the system automatically transitions the issue to `Closed`.

#### E. Tab 3: Dashboard & Analytics (AstraZeneca Theme)
- **KPI Badges:** Average Lead response time, total open issues, SLA compliance rate.
- **Quick Wins Matrix:** Chart positioning issues based on Priority (Impact) vs Effort.
- **Root Cause Analysis:** Chart showing the distribution of primary problem sources.
- **Blocker Metrics:** Total time lost to blockers and top blocker reasons.
- **Reporting:** Export summary button generating a compiled PDF / Excel report.

#### F. Global Features
- **Global Search (`Cmd+K` / `Ctrl+K` Command Palette):** Accessible from anywhere in the app for instant navigation to issues, tasks, or discussions.
- **Backup Lead Assignments:** Support for reassigning area leads during absences/vacations.
- **In-App & Email Notifications (Resend):** Notification bell dropdown in the top bar + email alerts sent to Leads.

---

### 6. ROLL-OUT PLAN FOR CLAUDE CODE (EXECUTION STEPS)

1. **STEP 1:** Read `.env`, create repository directory structure (`/backend` for FastAPI, `/frontend` for Next.js), connect to Supabase, and execute SQL scripts (tables, indexes, storage buckets). *Commit & test.*
2. **STEP 2:** Configure FastAPI & Supabase Auth with RBAC (`Employee`/`Lead`), Backup Lead support, AstraZeneca Pharma layout, and `Cmd+K` navigation palette. *Commit & test.*
3. **STEP 3:** Build Tab 1 (Issue creation form with Anti-Duplicate Guard, SLA business-days table, Blocker management, Drawer with Audit Log). *Commit & test.*
4. **STEP 4:** Build Tab 2 (Communications Center Inbox/Chat layout, comment editing rules, in-app notification triggers). *Commit & test.*
5. **STEP 5:** Build Tab 4 (Kanban View A/B, Task Templates, Auto-Sync logic, Root Cause modal). *Commit & test.*
6. **STEP 6:** Implement Two-Stage Closure logic (Close-Loop with `closed_by_user_id` registration and 5-day auto-close). *Commit & test.*
7. **STEP 7:** Build Tab 3 (Dashboard, KPIs, Quick Wins Matrix, Root Cause chart, Blocker statistics, PDF/Excel exporter). *Commit & test.*
8. **STEP 8:** Integrate In-App Notification Bell and Resend email service for Leads. Conduct comprehensive end-to-end testing across the full app lifecycle. *Commit & test.*