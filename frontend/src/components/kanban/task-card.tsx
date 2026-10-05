"use client";

import { useDraggable } from "@dnd-kit/core";
import { cn } from "cn";
import { ArrowRightLeft, Ban, GripVertical, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Pill } from "@/components/issues/pills";
import { initials } from "@/components/layout/user-menu";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { issueKey } from "@/lib/format";
import { TASK_COLUMNS, type Task, type TaskStatus } from "@/lib/types";

export interface TaskActions {
  onEdit?: (task: Task) => void;
  /** Present only when the user may delete this task (issue creator or Lead). */
  onDelete?: (task: Task) => void;
}

export function TaskCard({ task, showIssue, onMove, disabled, actions }: {
  task: Task;
  showIssue?: boolean;
  onMove: (task: Task, status: TaskStatus) => void;
  disabled?: boolean;
  actions?: TaskActions;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled,
  });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`task-${task.id}`}
      className={cn(
        "group rounded-xl border bg-card p-3 shadow-sm transition-shadow",
        isDragging ? "z-50 shadow-lg ring-2 ring-brand-berry/40" : "hover:shadow-md",
        task.issue_blocked && "border-brand-berry/40",
      )}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          aria-label={`Drag ${task.title}`}
          className={cn("mt-0.5 cursor-grab touch-none text-muted-foreground/60 active:cursor-grabbing", disabled && "invisible")}
          {...listeners}
          {...attributes}
        >
          <GripVertical className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium leading-snug">{task.title}</div>
          {task.summary && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{task.summary}</div>}
          {showIssue && (
            <div className="mt-1.5 truncate text-[11px] text-muted-foreground">
              <span className="font-mono">{issueKey(task.issue_id)}</span> · {task.issue_title}
            </div>
          )}
        </div>
        {!disabled && (
          <DropdownMenu>
            <DropdownMenuTrigger aria-label={`Move ${task.title}`}
              className="rounded p-1 text-muted-foreground opacity-60 hover:bg-muted hover:opacity-100">
              <ArrowRightLeft className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {TASK_COLUMNS.filter((c) => c.status !== task.status).map((c) => (
                <DropdownMenuItem key={c.status} onClick={() => onMove(task, c.status)}>Move to {c.label}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {!disabled && (actions?.onEdit || actions?.onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger aria-label={`Task actions ${task.title}`}
              className="rounded p-1 text-muted-foreground opacity-60 hover:bg-muted hover:opacity-100">
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {actions.onEdit && (
                <DropdownMenuItem onClick={() => actions.onEdit!(task)}><Pencil /> Edit task</DropdownMenuItem>
              )}
              {actions.onDelete && (
                <DropdownMenuItem variant="destructive" onClick={() => actions.onDelete!(task)}>
                  <Trash2 /> Delete task
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        {task.issue_blocked && <Pill className="bg-brand-berry px-2 text-[10px] text-white"><Ban className="size-3" />BLOCKED</Pill>}
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {task.assignee_name ?? "Unassigned"}
          <span className={cn("flex size-5 items-center justify-center rounded-full text-[9px] font-semibold text-white",
            task.assignee_name ? "bg-brand-navy" : "bg-muted-foreground/40")}>
            {task.assignee_name ? initials(task.assignee_name) : "?"}
          </span>
        </span>
      </div>
    </div>
  );
}
