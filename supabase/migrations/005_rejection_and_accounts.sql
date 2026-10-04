-- 005: issue rejection by a Lead (with reason) + account activation flag.
alter table public.issues drop constraint issues_status_check;
alter table public.issues add constraint issues_status_check
  check (status in ('New', 'In Progress', 'Resolved', 'Closed', 'Rejected'));

alter table public.issues
  add column rejected_reason     text,
  add column rejected_at         timestamptz,
  add column rejected_by_user_id uuid references public.users(id);

alter table public.issues add constraint rejected_needs_reason
  check (status <> 'Rejected' or (length(trim(coalesce(rejected_reason, ''))) > 0 and rejected_at is not null));

-- Deactivated accounts keep their history but cannot use the app.
alter table public.users add column is_active boolean not null default true;
