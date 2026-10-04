"use client";

import {
  DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import { cn } from "cn";

import { TASK_COLUMNS, type Task, type TaskStatus } from "@/lib/types";

import { TaskCard, type TaskActions } from "./task-card";

export interface Lane {
  id: string;            // assignee id, or "unassigned"
  label: string;
}

/** Drop target id format: `${laneId}|${status}`. */
function Column({ laneId, status, label, tasks, showIssue, onMove, canMove, header, actionsFor }: {
  laneId: string; status: TaskStatus; label: string; tasks: Task[]; showIssue?: boolean;
  onMove: (task: Task, status: TaskStatus) => void; canMove: (task: Task) => boolean; header: boolean;
  actionsFor?: (task: Task) => TaskActions;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${laneId}|${status}` });
  return (
    <div
      ref={setNodeRef}
      data-testid={`column-${laneId}-${status}`}
      className={cn("flex flex-col gap-2 rounded-2xl bg-muted/60 p-2 transition-colors", header ? "min-h-28" : "min-h-12",
        isOver && "bg-[#fbe6f1]/70 ring-2 ring-az-berry/30")}
    >
      {header && (
        <div className="flex items-center justify-between px-1.5 pt-1 text-xs font-semibold uppercase tracking-wide text-az-navy">
          {label}
          <span className="rounded-full bg-card px-2 py-0.5 text-[11px] text-muted-foreground">{tasks.length}</span>
        </div>
      )}
      {tasks.map((t) => (
        <TaskCard key={t.id} task={t} showIssue={showIssue} onMove={onMove} disabled={!canMove(t)}
          actions={actionsFor?.(t)} />
      ))}
    </div>
  );
}

export function KanbanBoard({ tasks, lanes, onMove, canMove, showIssue, actionsFor }: {
  tasks: Task[];
  /** When provided, renders one horizontal swimlane per entry (grouped by assignee). */
  lanes?: Lane[];
  onMove: (task: Task, status: TaskStatus, assigneeId?: string | null) => void;
  canMove: (task: Task) => boolean;
  showIssue?: boolean;
  /** Edit/delete callbacks per task (omit a callback to hide that action). */
  actionsFor?: (task: Task) => TaskActions;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  function onDragEnd(e: DragEndEvent) {
    const task = e.active.data.current?.task as Task | undefined;
    if (!task || !e.over) return;
    const [laneId, status] = String(e.over.id).split("|") as [string, TaskStatus];
    const assignee = laneId === "unassigned" ? null : laneId;
    const laneChanged = lanes !== undefined && assignee !== task.assignee_id;
    if (status !== task.status || laneChanged) onMove(task, status, laneChanged ? assignee : undefined);
  }

  const columnsFor = (laneId: string, laneTasks: Task[], header: boolean) => (
    <div className="grid grid-cols-3 gap-3">
      {TASK_COLUMNS.map((c) => (
        <Column key={c.status} laneId={laneId} status={c.status} label={c.label} header={header}
          tasks={laneTasks.filter((t) => t.status === c.status)} showIssue={showIssue}
          onMove={(t, s) => onMove(t, s)} canMove={canMove} actionsFor={actionsFor} />
      ))}
    </div>
  );

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      {!lanes ? (
        columnsFor("board", tasks, true)
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 pl-0 text-xs font-semibold uppercase tracking-wide text-az-navy">
            {TASK_COLUMNS.map((c) => <div key={c.status} className="px-3">{c.label}</div>)}
          </div>
          {lanes.map((lane) => {
            const laneTasks = tasks.filter((t) => (t.assignee_id ?? "unassigned") === lane.id);
            return (
              <section key={lane.id} data-testid={`lane-${lane.id}`} className="rounded-2xl bg-card p-3 shadow-sm">
                <h3 className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold text-az-navy">
                  {lane.label}
                  <span className="text-xs font-normal text-muted-foreground">{laneTasks.length} tasks</span>
                </h3>
                {columnsFor(lane.id, laneTasks, false)}
              </section>
            );
          })}
        </div>
      )}
    </DndContext>
  );
}
