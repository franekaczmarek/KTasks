"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { Ban, Bell, CheckCheck, CircleCheck, MessageSquare, UserPlus, Workflow } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";

interface Notification {
  id: number;
  type: string;
  message: string;
  link: string | null;
  issue_id: number | null;
  read_status: boolean;
  created_at: string;
}

const ICONS: Record<string, typeof Bell> = {
  issue_assigned: UserPlus, task_assigned: UserPlus, comment: MessageSquare, blocker_added: Ban,
  blocker_resolved: CircleCheck, verification_request: CircleCheck, resolution_confirmed: CheckCheck,
  auto_closed: CheckCheck, status_changed: Workflow,
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ items: Notification[]; unread_count: number }>("/notifications?limit=20"),
    refetchInterval: 20_000,
  });
  const unread = data?.unread_count ?? 0;

  const markRead = useMutation({
    mutationFn: (id: number) => api.post(`/notifications/${id}/read`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAll = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  function openItem(n: Notification) {
    if (!n.read_status) markRead.mutate(n.id);
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"}
        className="relative flex size-8 items-center justify-center rounded-full text-white/80 outline-none transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span data-testid="bell-count"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-az-berry px-1 text-[10px] font-semibold text-white ring-2 ring-az-navy">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0" data-testid="notification-panel">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="font-semibold text-az-navy">Notifications</div>
          {unread > 0 && (
            <button type="button" onClick={() => markAll.mutate()}
              className="text-xs font-medium text-az-berry hover:underline">
              Mark all as read
            </button>
          )}
        </div>
        <ul className="max-h-[420px] overflow-y-auto">
          {!data?.items.length && <li className="px-4 py-10 text-center text-sm text-muted-foreground">You&apos;re all caught up.</li>}
          {data?.items.map((n) => {
            const Icon = ICONS[n.type] ?? Bell;
            return (
              <li key={n.id}>
                <button type="button" onClick={() => openItem(n)} data-unread={!n.read_status || undefined}
                  className={cn("flex w-full gap-3 border-b px-4 py-3 text-left text-sm last:border-0 hover:bg-muted/50",
                    !n.read_status && "bg-[#fbe6f1]/40")}>
                  <Icon className={cn("mt-0.5 size-4 shrink-0", n.read_status ? "text-muted-foreground" : "text-az-plum")} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("line-clamp-2", !n.read_status && "font-medium")}>{n.message}</span>
                    <span className="text-xs text-muted-foreground">{timeAgo(n.created_at)}</span>
                  </span>
                  {!n.read_status && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-az-berry" aria-label="unread" />}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
