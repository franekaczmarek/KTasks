-- 007: agreed due date changes need the reporter's approval.
-- issues.expected_end_date is the agreed date (the SLA deadline once set); every later change is a request.
create table if not exists public.due_date_requests (
  id                   bigint generated always as identity primary key,
  issue_id             bigint not null references public.issues(id) on delete cascade,
  requested_by_user_id uuid not null references public.users(id),
  from_date            date not null,
  to_date              date not null,
  reason               text not null check (char_length(btrim(reason)) >= 5),
  status               text not null default 'pending'
                       check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  decision_note        text,
  decided_by_user_id   uuid references public.users(id),
  decided_at           timestamptz,
  created_at           timestamptz not null default now(),
  check ((status = 'pending') = (decided_at is null))
);

create index if not exists due_date_requests_issue_idx on public.due_date_requests (issue_id, created_at);
-- At most one open request per issue.
create unique index if not exists due_date_requests_one_pending
  on public.due_date_requests (issue_id) where status = 'pending';

alter table public.due_date_requests enable row level security;
revoke all on public.due_date_requests from anon, authenticated;
