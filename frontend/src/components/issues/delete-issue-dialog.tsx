"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
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

/** Reporter or assigned Lead deletes an issue (soft delete: hidden in the app, kept for audit). */
export function DeleteIssueDialog({ issueId, title, onDeleted }: { issueId: number; title: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: () => api.delete(`/issues/${issueId}`, reason.trim() ? { reason: reason.trim() } : undefined),
    onSuccess: () => {
      toast.success(`${issueKey(issueId)} deleted`);
      setOpen(false);
      ["issues", "tasks", "discussions", "dashboard", "notifications"].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }));
      queryClient.removeQueries({ queryKey: ["issue", issueId] });
      onDeleted();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Trash2 /> Delete issue
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" data-testid="delete-issue-dialog">
          <DialogHeader>
            <DialogTitle className="text-az-navy">Delete {issueKey(issueId)}?</DialogTitle>
            <DialogDescription>
              &ldquo;{title}&rdquo; and its tasks, discussion and attachments will disappear from KTasks for everyone.
              The deletion is recorded for audit, and the people involved will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="delete-reason">Reason (optional)</Label>
            <Textarea id="delete-reason" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Reported by mistake, test entry…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>Delete issue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
