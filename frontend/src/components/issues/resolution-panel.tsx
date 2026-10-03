"use client";

import { useMutation } from "@tanstack/react-query";
import { BadgeCheck, Hourglass, Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/use-me";
import { api } from "@/lib/api";
import { fmtDateTime, issueKey } from "@/lib/format";
import type { IssueDetail } from "@/lib/types";

import { useInvalidateIssue } from "./issue-drawer";

/** Two-stage closure banner: Resolved -> reporter confirms (or auto-close after 5 business days). */
export function ResolutionPanel({ issue }: { issue: IssueDetail }) {
  const { data: me } = useMe();
  const invalidate = useInvalidateIssue();
  const confirm = useMutation({
    mutationFn: () => api.post(`/issues/${issue.id}/confirm-resolution`),
    onSuccess: () => {
      invalidate(issue.id);
      toast.success(`${issueKey(issue.id)} closed: thank you for confirming`);
    },
    onError: (e) => toast.error(e.message),
  });

  if (issue.status === "Resolved") {
    const isReporter = me?.id === issue.creator_id;
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4" data-testid="resolution-panel">
        <div className="flex items-start gap-3">
          <Hourglass className="mt-0.5 size-5 shrink-0 text-emerald-700" />
          <div className="flex-1 text-sm">
            <div className="font-semibold text-emerald-900">Awaiting confirmation</div>
            <p className="text-emerald-900/80">
              Resolved by {issue.resolved_by_name ?? "—"} on {fmtDateTime(issue.resolved_at)} · root cause{" "}
              <strong>{issue.root_cause}</strong>. Closes automatically on{" "}
              <strong data-testid="auto-close-at">{fmtDateTime(issue.metrics.auto_close_at)}</strong> if not confirmed.
            </p>
          </div>
          {isReporter && (
            <Button className="shrink-0 bg-az-navy hover:bg-az-navy/90" disabled={confirm.isPending}
              onClick={() => confirm.mutate()}>
              <BadgeCheck /> Confirm Resolution
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (issue.status === "Closed") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border bg-muted/60 p-4 text-sm" data-testid="closed-panel">
        <Lock className="size-5 text-muted-foreground" />
        <span>
          Closed {fmtDateTime(issue.closed_at)}{" "}
          {issue.closed_by_name
            ? <>, resolution confirmed by <strong>{issue.closed_by_name}</strong></>
            : <>, <strong>auto-closed</strong> after 5 business days without confirmation</>}
          .
        </span>
      </div>
    );
  }
  return null;
}
