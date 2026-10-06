import { fmtDate } from "@/lib/format";
import type { ActivityEntry, User } from "@/lib/types";

const FIELD_LABELS: Record<string, string> = {
  title: "title", summary: "summary", area: "area", priority: "priority", effort: "effort",
  expected_end_date: "expected end date",
};

/** Human-readable sentence for an audit-log entry. */
export function describeActivity(a: ActivityEntry, users: User[] = []): string {
  const d = a.details as Record<string, string | number | boolean | string[] | null>;
  const name = (id: unknown) => users.find((u) => u.id === id)?.name ?? "someone";
  const val = (v: unknown) => (v === null || v === undefined || v === "" ? "none" : String(v));
  switch (a.action_type) {
    case "created":
      return `created the issue${d.routed_to_backup ? " (routed to backup Lead)" : ""}`;
    case "status_changed":
      return `changed status from ${val(d.from)} to ${val(d.to)}`;
    case "date_changed":
      return `changed expected end date from ${val(d.from)} to ${val(d.to)}`;
    case "due_date_set":
      return `set the due date to ${fmtDate(String(d.date))}${d.reason ? `: "${d.reason}"` : ""}`;
    case "due_date_proposed":
      return `proposed the due date ${fmtDate(String(d.date))}: "${d.reason}"`;
    case "due_date_proposal_accepted":
      return d.self_approved
        ? `set the due date to ${fmtDate(String(d.date))} (own issue, self-approved)`
        : `accepted the proposed due date ${fmtDate(String(d.date))}`;
    case "due_date_proposal_overridden":
      return `set the due date to ${fmtDate(String(d.to))} instead of the proposed ${fmtDate(String(d.proposed))}: "${d.reason}"`;
    case "due_date_proposal_withdrawn":
      return `withdrew the proposed due date ${fmtDate(String(d.to))}`;
    case "due_date_change_requested":
      return `asked to move the due date from ${fmtDate(String(d.from))} to ${fmtDate(String(d.to))}: "${d.reason}"`;
    case "due_date_change_accepted":
      return d.self_approved
        ? `moved the due date from ${fmtDate(String(d.from))} to ${fmtDate(String(d.to))} (own issue, self-approved)`
        : `accepted the due date change to ${fmtDate(String(d.to))}`;
    case "due_date_change_declined":
      return `declined the due date change to ${fmtDate(String(d.to))}${d.note ? `: "${d.note}"` : ""}`;
    case "due_date_change_withdrawn":
      return `withdrew the due date change to ${fmtDate(String(d.to))}`;
    case "issue_hidden":
      return "hid the issue from employees";
    case "issue_unhidden":
      return "made the issue visible to everyone";
    case "backup_access_granted":
      return "made the hidden issue visible to the owner's backup";
    case "backup_access_revoked":
      return "removed the backup's access to the hidden issue";
    case "updated":
      return `changed ${FIELD_LABELS[String(d.field)] ?? d.field} from ${val(d.from)} to ${val(d.to)}`;
    case "reassigned":
      return `reassigned the issue from ${name(d.from)} to ${name(d.to)}`;
    case "blocker_added":
      return `added blocker: "${d.reason}"`;
    case "blocker_resolved":
      return `resolved blocker "${d.reason}" after ${d.business_days} business days`;
    case "joined_thread":
      return "joined the thread";
    case "attachments_added":
      return `attached ${(d.files as string[] | undefined)?.join(", ") ?? "files"}`;
    case "task_created":
      return `added task "${d.title}"`;
    case "task_moved":
      return `moved task "${d.title}" from ${val(d.from)} to ${val(d.to)}`;
    case "task_renamed":
      return `renamed task "${d.from}" to "${d.to}"`;
    case "task_updated":
      return `updated the details of task "${d.title}"`;
    case "task_reassigned":
      return `reassigned task "${d.title}" from ${d.from ? name(d.from) : "unassigned"} to ${d.to ? name(d.to) : "unassigned"}`;
    case "task_deleted":
      return `deleted task "${d.title}"`;
    case "templates_applied":
      return `applied task templates (${d.count} tasks)`;
    case "resolved":
      return `resolved the issue (root cause: ${d.root_cause})`;
    case "closed":
      return "confirmed the resolution and closed the issue";
    case "auto_closed":
      return `auto-closed the issue after ${d.business_days} business days without confirmation`;
    case "rejected":
      return `rejected the issue: "${d.reason}"`;
    case "deleted":
      return `deleted the issue${d.reason ? `: "${d.reason}"` : ""}`;
    case "reopened":
      return `reopened the issue${d.reason ? `: "${d.reason}"` : ""}`;
    default:
      return a.action_type.replaceAll("_", " ");
  }
}
