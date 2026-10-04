"use client";

import { useMutation } from "@tanstack/react-query";
import { CircleX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { issueKey } from "@/lib/format";

const MIN_REASON = 5;

/** Lead-only: reject an issue with a mandatory written reason (terminal state). */
export function RejectIssueDialog({ issueId, onRejected }: { issueId: number; onRejected: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= MIN_REASON;

  const reject = useMutation({
    mutationFn: () => api.post(`/issues/${issueId}/reject`, { reason: reason.trim() }),
    onSuccess: () => {
      toast.success(`${issueKey(issueId)} rejected: the reporter has been notified`);
      setOpen(false);
      setReason("");
      onRejected();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <CircleX /> Reject issue
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" data-testid="reject-dialog">
          <DialogHeader>
            <DialogTitle className="text-az-navy">Reject {issueKey(issueId)}?</DialogTitle>
            <DialogDescription>
              Rejected issues are closed without work and can no longer be edited. The reporter and everyone in the
              thread will see your reason.
            </DialogDescription>
          </DialogHeader>
          <form id="reject-issue" className="space-y-1.5"
            onSubmit={(e) => { e.preventDefault(); if (valid) reject.mutate(); }}>
            <Label htmlFor="reject-reason">Rejection reason (required)</Label>
            <Textarea id="reject-reason" rows={4} maxLength={1000} value={reason} autoFocus
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Duplicate of KT-12, expected behaviour per SOP-114, out of scope for QA…" />
            {reason.length > 0 && !valid && (
              <p className="text-xs text-destructive">Please give at least {MIN_REASON} characters.</p>
            )}
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="reject-issue" variant="destructive" disabled={!valid || reject.isPending}>
              Reject issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
