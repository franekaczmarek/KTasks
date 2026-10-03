-- 001_schema.sql: core tables for KTasks
create extension if not exists pg_trgm;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Users mirror auth.users; role drives RBAC.
create table public.users (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text not null unique,
  name           text not null,
  role           text not null default 'employee' check (role in ('employee', 'lead')),
  backup_lead_id uuid references public.users(id) on delete set null,
  is_absent      boolean not null default false,
  created_at     timestamptz not null default now()
);

-- One Lead per Area; routing falls back to the lead's backup while absent.
create table public.area_leads (
  area    text primary key check (area in ('Operations', 'Process', 'Improvements')),
  lead_id uuid not null references public.users(id)
);

create table public.issues (
  id                  bigint generated always as identity primary key,
  title               text not null check (length(trim(title)) > 0),
  summary             text not null default '',
  area                text not null check (area in ('Operations', 'Process', 'Improvements')),
  priority            text not null check (priority in ('Low', 'Medium', 'High', 'Critical')),
  effort              text not null check (effort in ('Low', 'Medium', 'High')),
  root_cause          text check (root_cause in ('Procedure', 'Human Error', 'IT/Equipment', 'Training', 'Vendor', 'Other')),
  status              text not null default 'New' check (status in ('New', 'In Progress', 'Resolved', 'Closed')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  start_date          timestamptz,
  expected_end_date   date,
  creator_id          uuid not null references public.users(id),
  lead_id             uuid references public.users(id),
  resolved_at         timestamptz,
  resolved_by_user_id uuid references public.users(id),
  closed_by_user_id   uuid references public.users(id),
  closed_at           timestamptz,
  constraint resolved_needs_root_cause check (status not in ('Resolved', 'Closed') or root_cause is not null)
);
create trigger issues_updated_at before update on public.issues
  for each row execute function public.set_updated_at();

create table public.attachments (
  id           bigint generated always as identity primary key,
  issue_id     bigint not null references public.issues(id) on delete cascade,
  storage_path text not null unique,
  filename     text not null,
  mime         text,
  size         bigint,
  uploaded_by  uuid references public.users(id),
  created_at   timestamptz not null default now()
);

create table public.blockers (
  id                 bigint generated always as identity primary key,
  issue_id           bigint not null references public.issues(id) on delete cascade,
  reason             text not null check (length(trim(reason)) > 0),
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz,
  created_by_user_id uuid references public.users(id),
  is_active          boolean not null default true,
  constraint blocker_resolution check (is_active = (resolved_at is null))
);

create table public.tasks (
  id          bigint generated always as identity primary key,
  issue_id    bigint not null references public.issues(id) on delete cascade,
  title       text not null check (length(trim(title)) > 0),
  summary     text not null default '',
  status      text not null default 'ToDo' check (status in ('ToDo', 'InProgress', 'Done')),
  assignee_id uuid references public.users(id) on delete set null,
  position    double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

create table public.task_templates (
  id      bigint generated always as identity primary key,
  title   text not null unique,
  summary text not null default '',
  sort    int not null default 0
);

create table public.comments (
  id         bigint generated always as identity primary key,
  issue_id   bigint not null references public.issues(id) on delete cascade,
  user_id    uuid not null references public.users(id),
  content    text not null check (length(trim(content)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_edited  boolean not null default false
);
create trigger comments_updated_at before update on public.comments
  for each row execute function public.set_updated_at();

-- Participants of an issue thread: notification fan-out + unread tracking.
create table public.issue_participants (
  issue_id     bigint not null references public.issues(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  joined_at    timestamptz not null default now(),
  primary key (issue_id, user_id)
);

create table public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.users(id) on delete cascade,
  issue_id    bigint references public.issues(id) on delete cascade,
  type        text not null,
  message     text not null,
  link        text,
  read_status boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.activity_log (
  id          bigint generated always as identity primary key,
  issue_id    bigint not null references public.issues(id) on delete cascade,
  user_id     uuid references public.users(id),
  action_type text not null,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

insert into public.task_templates (title, summary, sort) values
  ('Root cause analysis', 'Identify and document the primary root cause.', 1),
  ('Fix implementation', 'Implement the corrective action.', 2),
  ('Fix testing', 'Verify the fix resolves the issue without side effects.', 3),
  ('SOP update', 'Update affected Standard Operating Procedures.', 4),
  ('Training', 'Brief affected staff on the change.', 5);
