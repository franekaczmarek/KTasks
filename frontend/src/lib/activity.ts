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
    case "templates_applied":
      return `applied task templates (${d.count} tasks)`;
    case "resolved":
      return `resolved the issue (root cause: ${d.root_cause})`;
    case "closed":
      return "confirmed the resolution and closed the issue";
    case "auto_closed":
      return `auto-closed the issue after ${d.business_days} business days without confirmation`;
    case "reopened":
      return `reopened the issue${d.reason ? `: "${d.reason}"` : ""}`;
    default:
      return a.action_type.replaceAll("_", " ");
  }
}
