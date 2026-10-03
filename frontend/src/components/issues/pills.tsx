import { cn } from "cn";
import { Ban } from "lucide-react";

import type { Area, IssueStatus, Metrics, Priority, SlaState } from "@/lib/types";

export function Pill({ className, children, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

const PRIORITY: Record<Priority, string> = {
  Low: "bg-slate-100 text-slate-700",
  Medium: "bg-sky-100 text-sky-800",
  High: "bg-amber-100 text-amber-800",
  Critical: "bg-rose-100 text-rose-800",
};

const STATUS: Record<IssueStatus, string> = {
  New: "bg-indigo-100 text-indigo-800",
  "In Progress": "bg-[#fbe6f1] text-az-plum",
  Resolved: "bg-emerald-100 text-emerald-800",
  Closed: "bg-slate-200 text-slate-700",
};

const AREA: Record<Area, string> = {
  Operations: "bg-[#e6ecf5] text-az-navy",
  Process: "bg-cyan-50 text-cyan-800",
  Improvements: "bg-lime-100 text-lime-800",
};

const SLA: Record<SlaState, { label: string; cls: string }> = {
  on_track: { label: "On track", cls: "bg-emerald-100 text-emerald-800" },
  at_risk: { label: "At risk", cls: "bg-amber-100 text-amber-800" },
  breached: { label: "Breached", cls: "bg-rose-100 text-rose-800" },
  met: { label: "Met", cls: "bg-slate-100 text-slate-700" },
};

export const PriorityPill = ({ value }: { value: Priority }) => <Pill className={PRIORITY[value]}>{value}</Pill>;
export const StatusPill = ({ value }: { value: IssueStatus }) => <Pill className={STATUS[value]}>{value}</Pill>;
export const AreaPill = ({ value }: { value: Area }) => <Pill className={AREA[value]}>{value}</Pill>;

export function BlockedPill() {
  return (
    <Pill className="bg-az-berry text-white" data-testid="blocked-badge">
      <Ban className="size-3" /> BLOCKED
    </Pill>
  );
}

export function SlaBadge({ metrics }: { metrics: Metrics }) {
  const s = SLA[metrics.sla_state];
  return (
    <Pill className={s.cls} title={`${metrics.lead_time_days} of ${metrics.sla_target_days} business days used`}
      data-testid="sla-badge">
      {s.label} · {metrics.sla_used_pct.toFixed(0)}%
    </Pill>
  );
}
