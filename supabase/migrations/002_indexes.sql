-- 002_indexes.sql
create index issues_status_idx       on public.issues (status);
create index issues_lead_idx         on public.issues (lead_id);
create index issues_creator_idx      on public.issues (creator_id);
create index issues_resolved_at_idx  on public.issues (resolved_at) where status = 'Resolved';
create index issues_title_trgm_idx   on public.issues using gin (title gin_trgm_ops);

create index attachments_issue_idx   on public.attachments (issue_id);
create index blockers_issue_idx      on public.blockers (issue_id, created_at);
create index blockers_active_idx     on public.blockers (issue_id) where is_active;
create index tasks_issue_idx         on public.tasks (issue_id, status, position);
create index tasks_assignee_idx      on public.tasks (assignee_id);
create index comments_issue_idx      on public.comments (issue_id, created_at);
create index participants_user_idx   on public.issue_participants (user_id);
create index notifications_user_idx  on public.notifications (user_id, read_status, created_at desc);
create index activity_issue_idx      on public.activity_log (issue_id, created_at);
create index users_backup_idx        on public.users (backup_lead_id);
create index area_leads_lead_idx     on public.area_leads (lead_id);
