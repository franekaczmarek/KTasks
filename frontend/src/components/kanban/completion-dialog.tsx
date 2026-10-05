"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SimpleSelect } from "@/components/simple-select";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { issueKey } from "@/lib/format";
import { ROOT_CAUSES, type RootCause } from "@/lib/types";

import { NewTaskDialog } from "./new-task-dialog";

/**
 * Shown when the last open task of an issue is moved to Done:
 * "Are all works on this issue completed?"  YES -> root cause -> Resolved.  NO -> add a new To Do task.
 */
export function CompletionDialog({ issueId, onClose }: { issueId: number | null; onClose: () => void }) {
  const [step, setStep] = useState<"ask" | "root-cause" | "new-task">("ask");
  const [rootCause, setRootCause] = useState<RootCause | null>(null);
  const queryClient = useQueryClient();

  function close() {
    setStep("ask");
    setRootCause(null);
    onClose();
  }

  const resolve = useMutation({
    mutationFn: () => api.post(`/issues/${issueId}/resolve`, { root_cause: rootCause }),
    onSuccess: () => {
      toast.success(`${issueKey(issueId!)} resolved: the reporter has been asked to confirm`);
      ["issues", "tasks", "issue", "activity"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      close();
    },
    onError: (e) => toast.error(e.message),
  });

  if (issueId === null) return null;

  if (step === "new-task") {
    return (
      <NewTaskDialog issueId={issueId} required open
        onOpenChange={(open) => {
          if (!open) {
            close();
          }
        }}
        onCreated={close}
      />
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md" data-testid="completion-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-brand-navy">
            <CheckCircle2 className="size-5 text-emerald-600" /> All tasks are done
          </DialogTitle>
          <DialogDescription>Are all works on this issue ({issueKey(issueId)}) completed?</DialogDescription>
        </DialogHeader>
        {step === "root-cause" && (
          <div className="space-y-1.5">
            <Label htmlFor="root-cause">Primary root cause (required)</Label>
            <SimpleSelect id="root-cause" aria-label="Root cause" value={rootCause}
              options={ROOT_CAUSES.map((r) => ({ value: r, label: r }))} onChange={(v) => setRootCause(v as RootCause)} />
          </div>
        )}
        <DialogFooter>
          {step === "ask" ? (
            <>
              <Button variant="outline" onClick={() => setStep("new-task")}>No, more work needed</Button>
              <Button className="bg-brand-navy hover:bg-brand-navy/90" onClick={() => setStep("root-cause")}>
                Yes, resolve issue
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("ask")}>Back</Button>
              <Button className="bg-brand-navy hover:bg-brand-navy/90" disabled={!rootCause || resolve.isPending}
                onClick={() => resolve.mutate()}>
                Mark as Resolved
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
