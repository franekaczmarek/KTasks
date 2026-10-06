"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle2, Clock, EyeOff, FileIcon, History, Paperclip } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { SimpleSelect } from "@/components/simple-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMe, useUsers } from "@/hooks/use-me";
import { describeActivity } from "@/lib/activity";
import { api } from "@/lib/api";
import { fmtBytes, fmtDate, fmtDateTime, fmtDays, issueKey } from "@/lib/format";
import { isStaff } from "@/lib/roles";
import { PRIORITIES, type ActivityEntry, type IssueDetail, type User } from "@/lib/types";

import { DeleteIssueDialog } from "./delete-issue-dialog";
import { DueDateControl, DueDateHistory, DueDateRequestBanner } from "./due-date";
import { AreaPill, BlockedPill, HiddenPill, PriorityPill, SlaBadge, StatusPill } from "./pills";
import { RejectIssueDialog } from "./reject-dialog";

export function useInvalidateIssue() {
  const queryClient = useQueryClient();
  return (id: number) => {
    queryClient.invalidateQueries({ queryKey: ["issue", id] });
    queryClient.invalidateQueries({ queryKey: ["activity", id] });
    queryClient.invalidateQueries({ queryKey: ["issues"] });
  };
}

export function IssueDrawer({ issueId, onClose, children }: {
  issueId: number | null;
  onClose: () => void;
  /** Extra panels (e.g. resolution confirmation) rendered above the tabs. */
  children?: (issue: IssueDetail) => React.ReactNode;
}) {
  const { data: issue, isLoading } = useQuery({
    queryKey: ["issue", issueId],
    queryFn: () => api.get<IssueDetail>(`/issues/${issueId}`),
    enabled: issueId !== null,
  });

  return (
    <Sheet open={issueId !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
        data-testid="issue-drawer">
        {isLoading || !issue ? (
          <div className="space-y-3 p-6">
            <SheetTitle className="sr-only">Loading issue</SheetTitle>
            <Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="border-b bg-brand-navy p-6 text-white">
              <div className="font-mono text-xs text-white/60">{issueKey(issue.id)}</div>
              <SheetTitle className="text-lg text-white">{issue.title}</SheetTitle>
              <SheetDescription className="sr-only">Issue details, SLA metrics and activity</SheetDescription>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <StatusPill value={issue.status} />
                <PriorityPill value={issue.priority} />
                <AreaPill value={issue.area} />
                {issue.metrics.is_blocked && <BlockedPill />}
                {issue.is_hidden && <HiddenPill className="bg-white/15" />}
              </div>
            </SheetHeader>
            <div className="space-y-4 p-6">
              {children?.(issue)}
              <Tabs defaultValue="overview">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="activity"><History className="size-3.5" /> Activity</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="space-y-6 pt-4">
                  <Overview issue={issue} onDeleted={onClose} />
                </TabsContent>
                <TabsContent value="activity" className="pt-4">
                  <ActivityLog issueId={issue.id} />
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, icon, children, action }: {
  title: string; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-brand-navy">{icon}{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-muted/60 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-brand-navy">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Overview({ issue, onDeleted }: { issue: IssueDetail; onDeleted: () => void }) {
  const { data: me } = useMe();
  const { data: users = [] } = useUsers();
  // Lead-level rights come from the API: staff, the issue's owner, or the owner's backup while they're absent.
  const canLead = issue.viewer_can_lead;
  const canManage = canLead || me?.id === issue.creator_id;
  const m = issue.metrics;
  const editable = canLead && issue.status !== "Closed" && issue.status !== "Rejected";
  const proposal = issue.pending_due_date_request?.kind === "proposal" ? issue.pending_due_date_request : null;
  const dueDate = (
    <DueDateHistory issue={issue}>
      {issue.expected_end_date ? `${fmtDate(issue.expected_end_date)} (agreed)`
        : proposal ? `${fmtDate(proposal.to_date)} (proposed)` : "Not agreed yet"}
    </DueDateHistory>
  );

  return (
    <>
      {issue.summary && <p className="whitespace-pre-wrap text-sm leading-relaxed">{issue.summary}</p>}
      <DueDateRequestBanner issue={issue} />

      <Section title="SLA & time (business days)" icon={<Clock className="size-4" />}
        action={<SlaBadge metrics={m} />}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="sla-breakdown">
          <Stat label="Lead time" value={fmtDays(m.lead_time_days)} hint={m.sla_basis === "agreed"
            ? `due ${fmtDate(issue.expected_end_date)} (agreed)` : `target ${m.sla_target_days} bd (${issue.priority})`} />
          <Stat label="Cycle time" value={fmtDays(m.cycle_time_days)} hint={issue.start_date ? "since start" : "not started"} />
          <Stat label="Active work" value={fmtDays(m.active_work_days)} />
          <Stat label="Blocker time" value={fmtDays(m.blocker_time_days)} />
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={m.sla_used_pct > 100 ? "h-full bg-rose-500" : m.sla_used_pct >= 75 ? "h-full bg-amber-500" : "h-full bg-emerald-500"}
            style={{ width: `${Math.min(m.sla_used_pct, 100)}%` }} />
        </div>
      </Section>

      {editable ? <LeadControls issue={issue} users={users} /> : null}

      <Section title="Details">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {([
            ["Reported by", issue.creator_name],
            ["Lead", issue.lead_name ? `${issue.lead_name}${issue.lead_role === "director" ? " (Director)" : ""}` : "—"],
            ["Created", fmtDateTime(issue.created_at)],
            ["Started", fmtDateTime(issue.start_date)],
            ["Due date", dueDate],
            ["Effort", issue.effort],
            ["Root cause", issue.root_cause ?? "—"],
            ["Resolved", issue.resolved_at ? `${fmtDateTime(issue.resolved_at)} by ${issue.resolved_by_name ?? "—"}` : "—"],
            ["Closed", issue.closed_at ? `${fmtDateTime(issue.closed_at)}${issue.closed_by_name ? ` by ${issue.closed_by_name}` : " (auto)"}` : "—"],
            ...(issue.rejected_at ? [["Rejected", `${fmtDateTime(issue.rejected_at)} by ${issue.rejected_by_name ?? "—"}`]] : []),
            ["Participants", issue.participants.map((p) => p.name).join(", ")],
          ] as [string, ReactNode][]).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-28 shrink-0 text-muted-foreground">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Blockers issue={issue} canManage={canManage} />
      <Attachments issue={issue} canManage={canManage} />

      {/* Only the reporter or the Lead assigned to this issue may delete it; closed records are kept. */}
      {(me?.id === issue.creator_id || me?.id === issue.lead_id) && issue.status !== "Closed" && (
        <section className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 p-3"
          data-testid="danger-zone">
          <div className="text-sm">
            <div className="font-medium text-destructive">Delete this issue</div>
            <div className="text-xs text-muted-foreground">Removes it from KTasks for everyone. Recorded for audit.</div>
          </div>
          <DeleteIssueDialog issueId={issue.id} title={issue.title} onDeleted={onDeleted} />
        </section>
      )}
    </>
  );
}

function LeadControls({ issue, users }: { issue: IssueDetail; users: User[] }) {
  const { data: me } = useMe();
  const staff = isStaff(me);
  const invalidate = useInvalidateIssue();
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/issues/${issue.id}`, body),
    onSuccess: () => { invalidate(issue.id); toast.success("Issue updated"); },
    onError: (e) => toast.error(e.message),
  });
  // Issues are owned by staff; an employee backup can own one only through routing (kept so the select shows it).
  const leads = users.filter((u) => (isStaff(u) && u.is_active) || u.id === issue.lead_id)
    .map((u) => ({ value: u.id, label: u.role === "director" ? `${u.name} (Director)` : u.name }));
  const rejectable = issue.status === "New" || issue.status === "In Progress";
  const statusOptions = issue.status === "New" || issue.status === "In Progress"
    ? [{ value: "New", label: "New" }, { value: "In Progress", label: "In Progress" }]
    : [{ value: issue.status, label: issue.status }];

  return (
    <Section title={staff ? "Lead controls" : "Lead controls (acting as backup)"}
      action={rejectable && <RejectIssueDialog issueId={issue.id} onRejected={() => invalidate(issue.id)} />}>
      <div className="grid grid-cols-2 gap-3 rounded-xl border p-3 text-sm sm:grid-cols-4">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Status</span>
          <SimpleSelect aria-label="Status" value={issue.status} options={statusOptions}
            disabled={issue.status === "Resolved"} onChange={(status) => patch.mutate({ status })} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Priority</span>
          <SimpleSelect aria-label="Change priority" value={issue.priority}
            options={PRIORITIES.map((p) => ({ value: p, label: p }))} onChange={(priority) => patch.mutate({ priority })} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Lead</span>
          <SimpleSelect aria-label="Reassign lead" value={issue.lead_id} options={leads} disabled={!staff}
            onChange={(lead_id) => patch.mutate({ lead_id })} />
        </label>
        {/* Not a <label>: it holds buttons, which a wrapping label would rename. */}
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Due date (SLA)</span>
          <DueDateControl issue={issue}
            onSet={(expected_end_date, due_date_reason) => patch.mutate({ expected_end_date, due_date_reason })} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border p-3 text-sm"
        data-testid="visibility-controls">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-4 accent-brand-navy" checked={issue.is_hidden}
            disabled={patch.isPending} onChange={(e) => patch.mutate({ is_hidden: e.target.checked })} />
          <EyeOff className="size-4 text-muted-foreground" /> Hide from employees
        </label>
        {issue.is_hidden && (
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-brand-navy" checked={issue.visible_to_backup}
              disabled={patch.isPending || !issue.lead_backup_id}
              onChange={(e) => patch.mutate({ visible_to_backup: e.target.checked })} />
            Visible to backup
            <span className="text-xs text-muted-foreground">
              {issue.lead_backup_name ? `(${issue.lead_backup_name})` : "(the owner has no backup)"}
            </span>
          </label>
        )}
        <span className="basis-full text-xs text-muted-foreground">
          {issue.is_hidden
            ? "Only Leads, Directors, the reporter, the owner and task assignees can see this issue."
            : "Visible to everyone."}
        </span>
      </div>
    </Section>
  );
}

function Blockers({ issue, canManage }: { issue: IssueDetail; canManage: boolean }) {
  const [reason, setReason] = useState("");
  const invalidate = useInvalidateIssue();
  const open = issue.status === "New" || issue.status === "In Progress";
  const add = useMutation({
    mutationFn: () => api.post(`/issues/${issue.id}/blockers`, { reason }),
    onSuccess: () => { setReason(""); invalidate(issue.id); toast.success("Blocker added"); },
    onError: (e) => toast.error(e.message),
  });
  const resolve = useMutation({
    mutationFn: (id: number) => api.post(`/blockers/${id}/resolve`),
    onSuccess: () => { invalidate(issue.id); toast.success("Blocker resolved"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Section title={`Blockers (${issue.blockers.length})`} icon={<Ban className="size-4" />}>
      <ul className="space-y-2" data-testid="blockers">
        {issue.blockers.length === 0 && <li className="text-sm text-muted-foreground">No blockers recorded.</li>}
        {issue.blockers.map((b) => (
          <li key={b.id} className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${b.is_active ? "border-brand-berry/40 bg-[#fbe6f1]/50" : ""}`}>
            <div className="flex-1">
              <div className="font-medium">{b.reason}</div>
              <div className="text-xs text-muted-foreground">
                {fmtDateTime(b.created_at)} → {b.resolved_at ? fmtDateTime(b.resolved_at) : "ongoing"}
                {b.created_by_name && ` · by ${b.created_by_name}`}
              </div>
            </div>
            {b.is_active ? (
              canManage && (
                <Button size="xs" variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate(b.id)}>
                  <CheckCircle2 /> Resolve
                </Button>
              )
            ) : (
              <span className="text-xs font-medium text-emerald-700">Resolved</span>
            )}
          </li>
        ))}
      </ul>
      {canManage && open && (
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (reason.trim().length >= 3) add.mutate(); }}>
          <Input placeholder="What is blocking progress?" value={reason} onChange={(e) => setReason(e.target.value)}
            aria-label="Blocker reason" />
          <Button type="submit" variant="outline" disabled={reason.trim().length < 3 || add.isPending}>Add blocker</Button>
        </form>
      )}
    </Section>
  );
}

function Attachments({ issue, canManage }: { issue: IssueDetail; canManage: boolean }) {
  const invalidate = useInvalidateIssue();
  const upload = useMutation({
    mutationFn: (files: File[]) => {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      return api.post(`/issues/${issue.id}/attachments`, fd);
    },
    onSuccess: () => { invalidate(issue.id); toast.success("Attachment uploaded"); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Section title={`Attachments (${issue.attachments.length})`} icon={<Paperclip className="size-4" />}
      action={canManage && issue.status !== "Closed" && issue.status !== "Rejected" && (
        <label className="cursor-pointer text-xs font-medium text-brand-berry hover:underline">
          Add files
          <input type="file" multiple className="sr-only" aria-label="Add attachments"
            onChange={(e) => e.target.files?.length && upload.mutate(Array.from(e.target.files))} />
        </label>
      )}>
      <ul className="grid gap-2 sm:grid-cols-2" data-testid="attachments">
        {issue.attachments.length === 0 && <li className="text-sm text-muted-foreground">No attachments.</li>}
        {issue.attachments.map((a) => (
          <li key={a.id}>
            <a href={a.url ?? undefined} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 rounded-xl border p-2.5 text-sm hover:bg-muted/50">
              {a.mime?.startsWith("image/") && a.url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={a.url} alt="" className="size-10 rounded-md object-cover" />
                : <FileIcon className="size-5 text-muted-foreground" />}
              <span className="flex-1 truncate">{a.filename}</span>
              <span className="text-xs text-muted-foreground">{fmtBytes(a.size)}</span>
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ActivityLog({ issueId }: { issueId: number }) {
  const { data: users = [] } = useUsers({ includeInactive: true });
  const { data = [], isLoading } = useQuery({
    queryKey: ["activity", issueId],
    queryFn: () => api.get<ActivityEntry[]>(`/issues/${issueId}/activity`),
  });
  if (isLoading) return <Skeleton className="h-32 w-full" />;
  return (
    <ol className="relative space-y-4 border-l-2 border-muted pl-5" data-testid="activity-log">
      {data.map((a) => (
        <li key={a.id} className="relative">
          <span className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-white bg-brand-berry" />
          <div className="text-sm">
            <span className="font-medium">{a.user_name ?? "System"}</span> {describeActivity(a, users)}
          </div>
          <div className="text-xs text-muted-foreground">{fmtDateTime(a.created_at)}</div>
        </li>
      ))}
    </ol>
  );
}
