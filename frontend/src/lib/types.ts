export type Role = "employee" | "lead";
export type Area = "Operations" | "Process" | "Improvements";

export const AREAS: Area[] = ["Operations", "Process", "Improvements"];

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  backup_lead_id: string | null;
  is_absent: boolean;
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
  issues: { id: number; title: string; status: string; area: Area }[];
  tasks: { id: number; title: string; status: string; issue_id: number; issue_title: string }[];
  discussions: { issue_id: number; issue_title: string; snippet: string }[];
}

export type Priority = "Low" | "Medium" | "High" | "Critical";
export type Effort = "Low" | "Medium" | "High";
export type IssueStatus = "New" | "In Progress" | "Resolved" | "Closed";
export type RootCause = "Procedure" | "Human Error" | "IT/Equipment" | "Training" | "Vendor" | "Other";
export type TaskStatus = "ToDo" | "InProgress" | "Done";
export type SlaState = "on_track" | "at_risk" | "breached" | "met";

export const PRIORITIES: Priority[] = ["Low", "Medium", "High", "Critical"];
export const EFFORTS: Effort[] = ["Low", "Medium", "High"];
export const STATUSES: IssueStatus[] = ["New", "In Progress", "Resolved", "Closed"];
export const ROOT_CAUSES: RootCause[] = ["Procedure", "Human Error", "IT/Equipment", "Training", "Vendor", "Other"];

export interface Metrics {
  lead_time_days: number;
  cycle_time_days: number | null;
  blocker_time_days: number;
  active_work_days: number | null;
  sla_target_days: number;
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

export interface IssueDetail extends Issue {
  attachments: Attachment[];
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
  issue_blocked: boolean;
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
