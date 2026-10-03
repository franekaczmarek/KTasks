"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { issueKey } from "@/lib/format";
import type { MoveResult, Task, TaskStatus } from "@/lib/types";

/** Moves a task (optimistically) and surfaces the workflow side-effects returned by the API. */
export function useMoveTask(onCompletionPrompt: (issueId: number) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ task, status, assigneeId }: { task: Task; status: TaskStatus; assigneeId?: string | null }) =>
      api.patch<MoveResult>(`/tasks/${task.id}/move`, {
        status,
        ...(assigneeId !== undefined && { assignee_id: assigneeId }),
      }),
    onMutate: async ({ task, status, assigneeId }) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const snapshots = queryClient.getQueriesData<Task[]>({ queryKey: ["tasks"] });
      queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (old) =>
        old?.map((t) => (t.id === task.id
          ? { ...t, status, ...(assigneeId !== undefined && { assignee_id: assigneeId }) }
          : t)));
      return { snapshots };
    },
    onError: (e, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(e.message);
    },
    onSuccess: (res) => {
      if (res.issue_started) toast.info(`${issueKey(res.task.issue_id)} moved to In Progress`);
      if (res.completion_prompt) onCompletionPrompt(res.task.issue_id);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
    },
  });
}
