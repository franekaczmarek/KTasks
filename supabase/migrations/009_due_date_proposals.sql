-- 009: the reporter may propose a due date when creating an issue; a Lead accepts it or sets another one.
-- kind 'proposal': no agreed date yet (from_date is null), decided by a Lead.
-- kind 'change'  : a Lead moves the agreed date (from_date = current), decided by the reporter.
alter table public.due_date_requests
  add column if not exists kind text not null default 'change';

alter table public.due_date_requests drop constraint if exists due_date_requests_kind_check;
alter table public.due_date_requests
  add constraint due_date_requests_kind_check check (kind in ('proposal', 'change'));

alter table public.due_date_requests alter column from_date drop not null;

alter table public.due_date_requests drop constraint if exists due_date_requests_from_date_kind_check;
alter table public.due_date_requests
  add constraint due_date_requests_from_date_kind_check check ((kind = 'change') = (from_date is not null));
