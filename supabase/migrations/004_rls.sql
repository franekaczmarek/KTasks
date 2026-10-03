-- 004_rls.sql: the FastAPI backend is the only data path. Enable RLS with no
-- policies so the anon/authenticated Data API roles cannot read or write.
do $$
declare t text;
begin
  foreach t in array array['users','area_leads','issues','attachments','blockers','tasks',
                           'task_templates','comments','issue_participants','notifications','activity_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
