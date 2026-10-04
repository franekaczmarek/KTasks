"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { LayoutGrid, ListPlus, Plus, Rows3, Siren, Wand2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { BlockedPill, PriorityPill, StatusPill } from "@/components/issues/pills";
import { KanbanBoard, type Lane } from "@/components/kanban/board";
import { CompletionDialog } from "@/components/kanban/completion-dialog";
import { NewTaskDialog } from "@/components/kanban/new-task-dialog";
import { PageHeader } from "@/components/page-header";
import { SimpleSelect } from "@/components/simple-select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe, useUsers } from "@/hooks/use-me";
import { useMoveTask } from "@/hooks/use-move-task";
import { api } from "@/lib/api";
import { issueKey } from "@/lib/format";
import type { Issue, Task, User } from "@/lib/types";

export function WorkView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = params.get("view") === "global" ? "global" : "focused";
  const issueParam = params.get("issue");
  const { data: me } = useMe();
  const [completionFor, setCompletionFor] = useState<number | null>(null);
  const move = useMoveTask(setCompletionFor);

  const setParams = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    Object.entries(next).forEach(([k, v]) => (v === null ? p.delete(k) : p.set(k, v)));
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const canMove = (t: Task, issue?: Pick<Issue, "creator_id">) =>
    !!me && (me.role === "lead" || t.assignee_id === me.id || issue?.creator_id === me.id) &&
    !["Resolved", "Closed", "Rejected"].includes(t.issue_status);

  return (
    <>
      <PageHeader
        title="Work"
        description="Kanban boards for issue action items. Moving tasks keeps issue status in sync."
        actions={
          <div className="flex rounded-lg bg-card p-0.5 shadow-sm" role="tablist" aria-label="Board view">
            {([["focused", "Focused", LayoutGrid], ["global", "Global", Rows3]] as const).map(([v, label, Icon]) => (
              <button key={v} type="button" role="tab" aria-selected={view === v}
                onClick={() => setParams({ view: v === "focused" ? null : v })}
                className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  view === v ? "bg-az-navy text-white" : "text-muted-foreground hover:text-foreground")}>
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
        }
      />
      {view === "focused" ? (
        <FocusedBoard issueId={issueParam ? Number(issueParam) : null}
          onSelectIssue={(id) => setParams({ issue: String(id) })}
          onMove={(task, status) => move.mutate({ task, status })} canMove={canMove} />
      ) : (
        <GlobalBoard onMove={(task, status, assigneeId) => move.mutate({ task, status, assigneeId })} canMove={canMove} />
      )}
      <CompletionDialog issueId={completionFor} onClose={() => setCompletionFor(null)} />
    </>
  );
}

function FocusedBoard({ issueId, onSelectIssue, onMove, canMove }: {
  issueId: number | null;
  onSelectIssue: (id: number) => void;
  onMove: (task: Task, status: Task["status"]) => void;
  canMove: (t: Task, issue?: Pick<Issue, "creator_id">) => boolean;
}) {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const { data: issues = [] } = useQuery({
    queryKey: ["issues", "work-selector"],
    queryFn: () => api.get<Issue[]>("/issues?scope=all"),
  });
  const selectable = issues.filter((i) => !["Closed", "Rejected"].includes(i.status) || i.id === issueId);
  const issue = issues.find((i) => i.id === issueId);
  const { data: tasks, isLoading } = useQuery({
    queryKey: ["tasks", "issue", issueId],
    queryFn: () => api.get<Task[]>(`/tasks?issue_id=${issueId}`),
    enabled: issueId !== null,
  });

  const applyTemplates = useMutation({
    mutationFn: () => api.post<Task[]>(`/issues/${issueId}/tasks/from-templates`, {}),
    onSuccess: (all) => {
      queryClient.setQueryData(["tasks", "issue", issueId], all);
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      toast.success("Standard action items added to To Do");
    },
    onError: (e) => toast.error(e.message),
  });

  const locked = ["Resolved", "Closed", "Rejected"].includes(issue?.status ?? "");
  const canEdit = !!me && !!issue && (me.role === "lead" || me.id === issue.creator_id) && !locked;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-card p-4 shadow-sm">
        <SimpleSelect className="w-[28rem] max-w-full" aria-label="Select issue" value={issueId ? String(issueId) : null}
          placeholder="Select an issue…"
          options={selectable.map((i) => ({ value: String(i.id), label: `${issueKey(i.id)} · ${i.title}` }))}
          onChange={(v) => onSelectIssue(Number(v))} />
        {issue && (
          <div className="flex items-center gap-1.5">
            <StatusPill value={issue.status} /><PriorityPill value={issue.priority} />
            {issue.metrics.is_blocked && <BlockedPill />}
          </div>
        )}
        {issue?.metrics.red_alert && (
          <span className="flex items-center gap-1 text-sm font-medium text-rose-700" data-testid="red-alert">
            <Siren className="size-4" /> No scheduled tasks in progress
          </span>
        )}
        <div className="ml-auto flex gap-2">
          {canEdit && me?.role === "lead" && (
            <Button variant="outline" disabled={applyTemplates.isPending} onClick={() => applyTemplates.mutate()}>
              <Wand2 /> Apply task templates
            </Button>
          )}
          {canEdit && (
            <Button className="bg-az-navy hover:bg-az-navy/90" onClick={() => setNewTaskOpen(true)}>
              <Plus /> New task
            </Button>
          )}
        </div>
      </div>

      {issueId === null ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-card py-16 text-muted-foreground shadow-sm">
          <ListPlus className="size-10 text-az-navy/30" />
          <p className="text-sm">Choose an issue to see its board.</p>
        </div>
      ) : isLoading || !tasks ? (
        <Skeleton className="h-72 w-full rounded-2xl" />
      ) : (
        <KanbanBoard tasks={tasks} onMove={onMove} canMove={(t) => canMove(t, issue)} />
      )}
      {issueId !== null && <NewTaskDialog issueId={issueId} open={newTaskOpen} onOpenChange={setNewTaskOpen} />}
    </div>
  );
}

function GlobalBoard({ onMove, canMove }: {
  onMove: (task: Task, status: Task["status"], assigneeId?: string | null) => void;
  canMove: (t: Task) => boolean;
}) {
  const { data: users = [] } = useUsers();
  const { data: tasks, isLoading } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: () => api.get<Task[]>("/tasks"),
  });
  if (isLoading || !tasks) return <Skeleton className="h-96 w-full rounded-2xl" />;

  const withTasks = new Set(tasks.map((t) => t.assignee_id ?? "unassigned"));
  const lanes: Lane[] = [
    ...users.filter((u: User) => withTasks.has(u.id) || u.role === "employee")
      .map((u) => ({ id: u.id, label: u.name })),
    { id: "unassigned", label: "Unassigned" },
  ];
  return <KanbanBoard tasks={tasks} lanes={lanes} onMove={onMove} canMove={canMove} showIssue />;
}
