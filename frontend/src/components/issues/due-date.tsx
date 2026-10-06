"use client";

import { useMutation } from "@tanstack/react-query";
import { CalendarClock, Check, History, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMe } from "@/hooks/use-me";
import { describeActivity } from "@/lib/activity";
import { api } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { DueDateRequest, IssueDetail } from "@/lib/types";

import { useInvalidateIssue } from "./issue-drawer";

const MIN_REASON = 5;
const today = () => new Date().toLocaleDateString("en-CA"); // yyyy-mm-dd in local time

function useIssueAction(issueId: number, success: string) {
  const invalidate = useInvalidateIssue();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post(path, body),
    onSuccess: () => { invalidate(issueId); toast.success(success); },
    onError: (e) => toast.error(e.message),
  });
}

/**
 * The due date with its full history (proposals, decisions, changes and their comments) on hover or focus.
 * Without any history it renders the children as they are.
 */
export function DueDateHistory({ issue, children }: { issue: IssueDetail; children: ReactNode }) {
  const events = issue.due_date_events ?? [];
  if (events.length === 0) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger type="button" aria-label="Due date history" data-testid="due-date-history-trigger"
        className="inline-flex items-center gap-1 rounded-sm text-left underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-brand-navy/40">
        {children}
        <History className="size-3.5 text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-sm flex-col items-stretch gap-2 py-2.5">
        <div className="font-semibold">Due date history</div>
        <ol className="space-y-1.5" data-testid="due-date-history">
          {events.map((e) => (
            <li key={e.id} className="leading-snug">
              <span className="opacity-70">{fmtDateTime(e.created_at)} · </span>
              <span className="font-medium">{e.user_name ?? "System"}</span> {describeActivity(e)}
            </li>
          ))}
        </ol>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Lead controls cell for the agreed due date (the SLA deadline). The reporter may propose one at creation,
 * which a Lead accepts or replaces (banner). Without a proposal the Lead sets it once; afterwards a Lead can
 * only request a change, which applies when the reporter accepts it.
 */
export function DueDateControl({ issue, onSet }: {
  issue: IssueDetail; onSet: (date: string, reason: string) => void;
}) {
  const { data: me } = useMe();
  const withdraw = useIssueAction(issue.id, "Due date change withdrawn");
  const [draft, setDraft] = useState("");
  const [comment, setComment] = useState("");
  const pending = issue.pending_due_date_request;
  const active = issue.status === "New" || issue.status === "In Progress";

  if (!issue.expected_end_date) {
    if (pending?.kind === "proposal") {
      return (
        <div className="space-y-1" data-testid="due-date-control">
          <DueDateHistory issue={issue}>
            <span className="flex h-8 items-center gap-1.5 font-medium text-amber-800">
              <CalendarClock className="size-4" /> {fmtDate(pending.to_date)}
            </span>
          </DueDateHistory>
          <span className="block text-[11px] text-amber-700">Proposed by the reporter: decide above</span>
        </div>
      );
    }
    return (
      <div className="space-y-1">
        <div className="flex gap-1">
          <Input type="date" aria-label="Expected end date" className="h-8" min={today()} value={draft}
            onChange={(e) => setDraft(e.target.value)} />
          <Button size="sm" variant="outline" className="h-8" disabled={!draft || draft < today()}
            onClick={() => onSet(draft, comment.trim())}>
            Set
          </Button>
        </div>
        <Input aria-label="Due date comment" className="h-7 text-xs" maxLength={1000} value={comment}
          placeholder="Comment (optional)" onChange={(e) => setComment(e.target.value)} />
        <span className="block text-[11px] text-muted-foreground">Set once; changes need reporter approval</span>
      </div>
    );
  }
  return (
    <div className="space-y-1" data-testid="due-date-control">
      <DueDateHistory issue={issue}>
        <span className="flex h-8 items-center gap-1.5 font-medium" data-testid="agreed-due-date">
          <CalendarClock className="size-4 text-brand-navy" /> {fmtDate(issue.expected_end_date)}
        </span>
      </DueDateHistory>
      {pending ? (
        <div className="text-[11px] text-amber-700">
          → {fmtDate(pending.to_date)} awaiting reporter
          {pending.requested_by_user_id === me?.id && (
            <button type="button" className="ml-1 font-medium text-brand-berry hover:underline"
              disabled={withdraw.isPending}
              onClick={() => withdraw.mutate({ path: `/due-date-requests/${pending.id}/withdraw` })}>
              Withdraw
            </button>
          )}
        </div>
      ) : active && <DueDateRequestDialog issue={issue} />}
    </div>
  );
}

/** Date + required reason form shared by "Request change" and "Set a different date". */
function DateReasonDialog({ open, onOpenChange, title, description, submitLabel, testId, excluded, pending, onSubmit }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: ReactNode;
  submitLabel: string; testId: string; excluded: string | null; pending: boolean;
  onSubmit: (date: string, reason: string, done: () => void) => void;
}) {
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const valid = !!date && date >= today() && date !== excluded && reason.trim().length >= MIN_REASON;
  const done = () => { onOpenChange(false); setDate(""); setReason(""); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid={testId}>
        <DialogHeader>
          <DialogTitle className="text-brand-navy">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form id={testId} className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit(date, reason.trim(), done); }}>
          <div className="space-y-1.5">
            <Label htmlFor={`${testId}-date`}>New due date</Label>
            <Input id={`${testId}-date`} type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${testId}-reason`}>Reason (required)</Label>
            <Textarea id={`${testId}-reason`} rows={3} maxLength={1000} value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Waiting for the vendor's spare part, no technician available until…" />
            {reason.length > 0 && reason.trim().length < MIN_REASON && (
              <p className="text-xs text-destructive">Please give at least {MIN_REASON} characters.</p>
            )}
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form={testId} disabled={!valid || pending}
            className="bg-brand-navy hover:bg-brand-navy/90">
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DueDateRequestDialog({ issue }: { issue: IssueDetail }) {
  const [open, setOpen] = useState(false);
  const request = useIssueAction(issue.id, "Change requested: the reporter has been asked to approve it");

  return (
    <>
      <button type="button" className="text-[11px] font-medium text-brand-berry hover:underline"
        onClick={() => setOpen(true)}>
        Request change
      </button>
      <DateReasonDialog open={open} onOpenChange={setOpen} testId="due-date-request-dialog"
        title="Request a new due date" submitLabel="Send for approval" excluded={issue.expected_end_date}
        pending={request.isPending}
        description={<>The agreed date ({fmtDate(issue.expected_end_date)}) is the SLA deadline. The new date applies
          only after {issue.creator_name} accepts it.</>}
        onSubmit={(to_date, reason, done) => request.mutate(
          { path: `/issues/${issue.id}/due-date-requests`, body: { to_date, reason } }, { onSuccess: done })} />
    </>
  );
}

/** Banner for a pending due date request: a reporter's proposal (a Lead decides) or a Lead's change (the reporter decides). */
export function DueDateRequestBanner({ issue }: { issue: IssueDetail }) {
  const req = issue.pending_due_date_request;
  if (!req) return null;
  return req.kind === "proposal" ? <ProposalBanner issue={issue} req={req} /> : <ChangeBanner issue={issue} req={req} />;
}

function ProposalBanner({ issue, req }: { issue: IssueDetail; req: DueDateRequest }) {
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const accept = useIssueAction(issue.id, "Proposed due date accepted");
  const counter = useIssueAction(issue.id, "Due date set");
  const withdraw = useIssueAction(issue.id, "Proposed due date withdrawn");
  const isRequester = me?.id === req.requested_by_user_id;
  const canDecide = issue.viewer_can_lead && !isRequester;
  const busy = accept.isPending || counter.isPending || withdraw.isPending;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4" data-testid="due-date-request-banner">
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 size-5 shrink-0 text-amber-700" />
        <div className="flex-1 text-sm">
          <div className="font-semibold text-amber-900">Due date proposed</div>
          <p className="text-amber-900/80">
            {isRequester ? "You proposed" : `${req.requested_by_name} proposes`} the due date{" "}
            <strong>{fmtDate(req.to_date)}</strong>.
            {canDecide ? " Accept it, or set a different date with a comment."
              : ` Waiting for ${issue.lead_name ?? "the Lead"} to decide.`}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-amber-900" data-testid="due-date-request-reason">
            Reason: {req.reason}
          </p>
        </div>
      </div>
      {(canDecide || isRequester) && (
        <div className="mt-3 flex justify-end gap-2">
          {isRequester && (
            <Button variant="outline" size="sm" disabled={busy}
              onClick={() => withdraw.mutate({ path: `/due-date-requests/${req.id}/withdraw` })}>
              <X /> Withdraw
            </Button>
          )}
          {canDecide && (
            <>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setOpen(true)}>
                Set a different date
              </Button>
              <Button size="sm" className="bg-brand-navy hover:bg-brand-navy/90" disabled={busy}
                onClick={() => accept.mutate({ path: `/due-date-requests/${req.id}/accept` })}>
                <Check /> Accept {fmtDate(req.to_date)}
              </Button>
            </>
          )}
        </div>
      )}
      <DateReasonDialog open={open} onOpenChange={setOpen} testId="due-date-counter-dialog"
        title="Set a different due date" submitLabel="Set due date" excluded={req.to_date} pending={counter.isPending}
        description={<>{req.requested_by_name} proposed {fmtDate(req.to_date)}. Your date applies at once and becomes the
          SLA deadline; explain why it differs.</>}
        onSubmit={(to_date, reason, done) => counter.mutate(
          { path: `/due-date-requests/${req.id}/counter`, body: { to_date, reason } }, { onSuccess: done })} />
    </div>
  );
}

function ChangeBanner({ issue, req }: { issue: IssueDetail; req: DueDateRequest }) {
  const { data: me } = useMe();
  const accept = useIssueAction(issue.id, "New due date accepted");
  const decline = useIssueAction(issue.id, "Due date change declined");
  const isReporter = me?.id === issue.creator_id;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4" data-testid="due-date-request-banner">
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 size-5 shrink-0 text-amber-700" />
        <div className="flex-1 text-sm">
          <div className="font-semibold text-amber-900">Due date change requested</div>
          <p className="text-amber-900/80">
            {req.requested_by_name} asks to move the due date from <strong>{fmtDate(req.from_date)}</strong> to{" "}
            <strong>{fmtDate(req.to_date)}</strong>.
            {isReporter ? " It takes effect only if you accept." : ` Waiting for ${issue.creator_name} to accept.`}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-amber-900" data-testid="due-date-request-reason">
            Reason: {req.reason}
          </p>
        </div>
      </div>
      {isReporter && (
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={decline.isPending || accept.isPending}
            onClick={() => decline.mutate({ path: `/due-date-requests/${req.id}/decline`, body: {} })}>
            <X /> Decline
          </Button>
          <Button size="sm" className="bg-brand-navy hover:bg-brand-navy/90" disabled={decline.isPending || accept.isPending}
            onClick={() => accept.mutate({ path: `/due-date-requests/${req.id}/accept` })}>
            <Check /> Accept new date
          </Button>
        </div>
      )}
    </div>
  );
}
