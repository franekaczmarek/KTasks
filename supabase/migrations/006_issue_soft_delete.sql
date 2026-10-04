-- 006: soft delete of issues (hidden everywhere, kept for audit).
alter table public.issues
  add column deleted_at         timestamptz,
  add column deleted_by_user_id uuid references public.users(id),
  add column deletion_reason    text;

create index issues_not_deleted_idx on public.issues (status) where deleted_at is null;
