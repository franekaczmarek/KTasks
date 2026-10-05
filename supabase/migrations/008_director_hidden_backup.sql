-- 008: Director role, Management area (owned by a Director), issues hidden from employees.
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in ('employee', 'lead', 'director'));

alter table public.area_leads drop constraint if exists area_leads_area_check;
alter table public.area_leads add constraint area_leads_area_check
  check (area in ('Operations', 'Process', 'Improvements', 'Management'));
alter table public.issues drop constraint if exists issues_area_check;
alter table public.issues add constraint issues_area_check
  check (area in ('Operations', 'Process', 'Improvements', 'Management'));

-- Hidden issues are visible to staff and involved users only; visible_to_backup also opens them
-- to the (possibly employee) backup of the issue's owner.
alter table public.issues
  add column if not exists is_hidden         boolean not null default false,
  add column if not exists visible_to_backup boolean not null default false,
  add column if not exists hidden_at         timestamptz,
  add column if not exists hidden_by_user_id uuid references public.users(id);

create index if not exists issues_hidden_idx on public.issues (id) where is_hidden;
