-- 003_storage.sql: private bucket for issue attachments (served via signed URLs from the backend)
insert into storage.buckets (id, name, public, file_size_limit)
values ('issue-attachments', 'issue-attachments', false, 10485760)
on conflict (id) do nothing;
