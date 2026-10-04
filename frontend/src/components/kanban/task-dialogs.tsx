"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { SimpleSelect } from "@/components/simple-select";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUsers } from "@/hooks/use-me";
import { api } from "@/lib/api";
import { issueKey } from "@/lib/format";
import type { Task } from "@/lib/types";

function useRefreshTasks() {
  const queryClient = useQueryClient();
  return () => {
    ["tasks", "issues", "issue", "activity"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  };
}

/** Rename, re-describe or reassign a task. Remounted per task (keyed) so the form starts from its values. */
export function EditTaskDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const { data: users = [] } = useUsers();
  const refresh = useRefreshTasks();
  const [title, setTitle] = useState(task.title);
  const [summary, setSummary] = useState(task.summary);
  const [assignee, setAssignee] = useState(task.assignee_id ?? "unassigned");

  const options = [{ value: "unassigned", label: "Unassigned" }, ...users.map((u) => ({ value: u.id, label: u.name }))];
  // Keep a (now deactivated) current assignee selectable so the field doesn't render blank.
  if (task.assignee_id && !users.some((u) => u.id === task.assignee_id)) {
    options.push({ value: task.assignee_id, label: `${task.assignee_name ?? "Unknown"} (inactive)` });
  }

  const save = useMutation({
    mutationFn: () => api.patch<Task>(`/tasks/${task.id}`, {
      title: title.trim(), summary: summary.trim(), assignee_id: assignee === "unassigned" ? null : assignee,
    }),
    onSuccess: () => {
      toast.success("Task updated");
      refresh();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const valid = title.trim().length >= 2;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="edit-task-dialog">
        <DialogHeader>
          <DialogTitle className="text-az-navy">Edit task</DialogTitle>
          <DialogDescription>{issueKey(task.issue_id)} · {task.issue_title}</DialogDescription>
        </DialogHeader>
        <form id="edit-task" className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="edit-task-title">Task title</Label>
            <Input id="edit-task-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-task-summary">Details</Label>
            <Textarea id="edit-task-summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-task-assignee">Assignee</Label>
            <SimpleSelect id="edit-task-assignee" aria-label="Task assignee" value={assignee} options={options}
              onChange={setAssignee} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="edit-task" disabled={!valid || save.isPending} className="bg-az-navy hover:bg-az-navy/90">
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Confirms deletion; reports whether the issue now needs the "all works completed?" question. */
export function DeleteTaskDialog({ task, onClose, onCompletionPrompt }: {
  task: Task; onClose: () => void; onCompletionPrompt: (issueId: number) => void;
}) {
  const refresh = useRefreshTasks();
  const remove = useMutation({
    mutationFn: () => api.delete<{ deleted: number; completion_prompt: boolean }>(`/tasks/${task.id}`),
    onSuccess: (r) => {
      toast.success(`Task "${task.title}" deleted`);
      refresh();
      onClose();
      if (r.completion_prompt) onCompletionPrompt(task.issue_id);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="delete-task-dialog">
        <DialogHeader>
          <DialogTitle className="text-az-navy">Delete task?</DialogTitle>
          <DialogDescription>
            &ldquo;{task.title}&rdquo; will be removed from {issueKey(task.issue_id)}. The deletion is recorded in the
            issue&apos;s activity log.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>Delete task</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
