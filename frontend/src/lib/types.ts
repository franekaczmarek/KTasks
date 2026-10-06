export type Role = "employee" | "lead" | "director";
export type Area = "Operations" | "Process" | "Improvements" | "Management";
/** Staff-only list filter for hidden issues. */
export type Visibility = "all" | "hidden" | "visible";

export const AREAS: Area[] = ["Operations", "Process", "Improvements", "Management"];

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  backup_lead_id: string | null;
  is_absent: boolean;
  is_active: boolean;
}

export interface AreaLead {
  area: Area;
  lead_id: string;
  lead_name: string;
  lead_absent: boolean;
  effective_lead_id: string;
  effective_lead_name: string;
}

export interface SearchResults {
  issues: { id: number; title: string; status: string; area: Area; is_hidden: boolean }[];
  tasks: { id: number; title: string; status: string; issue_id: number; issue_title: string }[];
  discussions: { issue_id: number; issue_title: string; snippet: string }[];
}

export type Priority = "Low" | "Medium" | "High" | "Critical";
export type Effort = "Low" | "Medium" | "High";
export type IssueStatus = "New" | "In Progress" | "Resolved" | "Closed" | "Rejected";
export type RootCause = "Procedure" | "Human Error" | "IT/Equipment" | "Training" | "Vendor" | "Other";
export type TaskStatus = "ToDo" | "InProgress" | "Done";
export type SlaState = "on_track" | "at_risk" | "breached" | "met" | "n_a";

export const PRIORITIES: Priority[] = ["Low", "Medium", "High", "Critical"];
export const EFFORTS: Effort[] = ["Low", "Medium", "High"];
export const STATUSES: IssueStatus[] = ["New", "In Progress", "Resolved", "Closed", "Rejected"];
export const ROOT_CAUSES: RootCause[] = ["Procedure", "Human Error", "IT/Equipment", "Training", "Vendor", "Other"];

export interface Metrics {
  lead_time_days: number;
  cycle_time_days: number | null;
  blocker_time_days: number;
  active_work_days: number | null;
  sla_target_days: number;
  /** "agreed": measured against the agreed due date; "priority": against the priority target. */
  sla_basis: "agreed" | "priority";
  sla_deadline: string;
  sla_used_pct: number;
  sla_state: SlaState;
  is_blocked: boolean;
  red_alert: boolean;
  task_counts: Record<TaskStatus, number>;
  auto_close_at: string | null;
}

export interface Blocker {
  id: number;
  issue_id: number;
  reason: string;
  created_at: string;
  resolved_at: string | null;
  created_by_user_id: string | null;
  created_by_name: string | null;
  is_active: boolean;
}

export interface Issue {
  id: number;
  title: string;
  summary: string;
  area: Area;
  priority: Priority;
  effort: Effort;
  root_cause: RootCause | null;
  status: IssueStatus;
  created_at: string;
  updated_at: string;
  start_date: string | null;
  expected_end_date: string | null;
  creator_id: string;
  creator_name: string;
  lead_id: string | null;
  lead_name: string | null;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
  resolved_by_name: string | null;
  closed_by_user_id: string | null;
  closed_by_name: string | null;
  closed_at: string | null;
  rejected_reason: string | null;
  rejected_at: string | null;
  rejected_by_user_id: string | null;
  rejected_by_name: string | null;
  /** Hidden from employees who are not involved (reporter, owner, task assignees, opened-to backup). */
  is_hidden: boolean;
  visible_to_backup: boolean;
  lead_role: Role | null;
  lead_backup_id: string | null;
  lead_backup_name: string | null;
  lead_absent: boolean | null;
  /** Lead-level rights for the signed-in user: staff, the owner, or the owner's backup while absent. */
  viewer_can_lead: boolean;
  metrics: Metrics;
  blockers: Blocker[];
}

export interface Attachment {
  id: number;
  filename: string;
  mime: string | null;
  size: number | null;
  created_at: string;
  url: string | null;
}

export interface DueDateRequest {
  id: number;
  /** proposal: the reporter's date at creation, decided by a Lead; change: a Lead's move, decided by the reporter. */
  kind: "proposal" | "change";
  from_date: string | null;
  to_date: string;
  reason: string;
  status: "pending" | "accepted" | "declined" | "withdrawn";
  decision_note: string | null;
  created_at: string;
  decided_at: string | null;
  requested_by_user_id: string;
  requested_by_name: string;
  decided_by_name: string | null;
}

export interface IssueDetail extends Issue {
  attachments: Attachment[];
  pending_due_date_request: DueDateRequest | null;
  due_date_history: DueDateRequest[];
  /** Every due date event (activity log), oldest first. */
  due_date_events: ActivityEntry[];
  participants: { id: string; name: string; role: Role }[];
}

export interface ActivityEntry {
  id: number;
  action_type: string;
  details: Record<string, unknown>;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
}

export interface DuplicateHit {
  id: number;
  title: string;
  status: IssueStatus;
  area: Area;
  priority: Priority;
  lead_name: string | null;
  score: number;
}

export interface DiscussionEntry {
  id: number;
  title: string;
  status: IssueStatus;
  priority: Priority;
  area: Area;
  is_hidden: boolean;
  last_comment: string | null;
  last_comment_by: string | null;
  last_comment_at: string | null;
  last_activity_at: string;
  is_participant: boolean;
  unread_count: number;
}

export interface Comment {
  id: number;
  issue_id: number;
  user_id: string;
  user_name: string;
  user_role: Role;
  content: string;
  created_at: string;
  updated_at: string;
  is_edited: boolean;
}

export const TASK_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "ToDo", label: "To Do" },
  { status: "InProgress", label: "In Progress" },
  { status: "Done", label: "Done" },
];

export interface Task {
  id: number;
  issue_id: number;
  title: string;
  summary: string;
  status: TaskStatus;
  assignee_id: string | null;
  assignee_name: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  issue_title: string;
  issue_status: IssueStatus;
  issue_priority: Priority;
  issue_creator_id: string;
  issue_hidden: boolean;
  issue_blocked: boolean;
  /** Lead-level rights on the task's issue (only on GET /tasks rows). */
  viewer_can_lead?: boolean;
}

export interface TaskTemplate {
  id: number;
  title: string;
  summary: string;
}

export interface MoveResult {
  task: Task;
  issue_status: IssueStatus;
  issue_started: boolean;
  completion_prompt: boolean;
}

export interface DashboardData {
  scope: { area: Area | null; days: number | null; issue_count: number; generated_at: string };
  kpis: {
    avg_lead_response_days: number | null;
    responded_count: number;
    awaiting_response: number;
    open_issues: number;
    open_blocked: number;
    open_breached: number;
    sla_compliance_pct: number | null;
    sla_finished_count: number;
    sla_met_count: number;
  };
  status_counts: Record<IssueStatus, number>;
  sla_status: {
    active: { on_track: number; at_risk: number; breached: number };
    finished: { met: number; breached: number };
    agreed_count: number;
    pending_requests: number;
  };
  quick_wins: {
    priority: Priority; effort: Effort; count: number; quick_win: boolean;
    issues: { id: number; title: string; status: IssueStatus }[];
  }[];
  root_causes: { root_cause: RootCause; count: number }[];
  blockers: {
    total_days: number;
    active: number;
    avg_days_per_blocked_issue: number | null;
    top_reasons: { reason: string; count: number; days: number }[];
  };
}
