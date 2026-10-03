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

export function NewTaskDialog({ issueId, open, onOpenChange, required, onCreated }: {
  issueId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "NO" branch of the completion modal: explains that a new To Do task is needed. */
  required?: boolean;
  onCreated?: (task: Task) => void;
}) {
  const { data: users = [] } = useUsers();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [assignee, setAssignee] = useState("unassigned");

  const create = useMutation({
    mutationFn: () => api.post<Task>(`/issues/${issueId}/tasks`, {
      title: title.trim(), summary: summary.trim(), assignee_id: assignee === "unassigned" ? null : assignee,
    }),
    onSuccess: (task) => {
      toast.success(`Task added to ${issueKey(issueId)}`);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      setTitle(""); setSummary(""); setAssignee("unassigned");
      onOpenChange(false);
      onCreated?.(task);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-az-navy">{required ? "Plan the remaining work" : "New task"}</DialogTitle>
          <DialogDescription>
            {required
              ? "Add the next To Do task. Without one the issue is flagged \"No scheduled tasks in progress\"."
              : `Add an action item to ${issueKey(issueId)}.`}
          </DialogDescription>
        </DialogHeader>
        <form id="new-task" className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); if (title.trim().length >= 2) create.mutate(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Task title</Label>
            <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-summary">Details</Label>
            <Textarea id="task-summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-assignee">Assignee</Label>
            <SimpleSelect id="task-assignee" aria-label="Assignee" value={assignee}
              options={[{ value: "unassigned", label: "Unassigned" }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
              onChange={setAssignee} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="new-task" disabled={title.trim().length < 2 || create.isPending}
            className="bg-az-navy hover:bg-az-navy/90">
            Add task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
