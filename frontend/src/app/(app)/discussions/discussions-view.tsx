"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { MessagesSquare, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { PriorityPill, StatusPill } from "@/components/issues/pills";
import { ChatThread } from "@/components/discussions/chat-thread";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { issueKey, timeAgo } from "@/lib/format";
import type { DiscussionEntry } from "@/lib/types";

export function DiscussionsView() {
  const router = useRouter();
  const pathname = usePathname();
  const selected = useSearchParams().get("issue");
  const selectedId = selected ? Number(selected) : null;
  const [filter, setFilter] = useState("");

  const { data: threads, isLoading } = useQuery({
    queryKey: ["discussions"],
    queryFn: () => api.get<DiscussionEntry[]>("/discussions"),
    refetchInterval: 15_000,
  });

  const visible = (threads ?? []).filter((t) =>
    `${issueKey(t.id)} ${t.title}`.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const current = threads?.find((t) => t.id === selectedId);

  return (
    <>
      <PageHeader title="Discussions" description="Conversations on every active issue." />
      <div className="grid h-[calc(100vh-13rem)] min-h-[480px] grid-cols-[340px_1fr] overflow-hidden rounded-2xl bg-card shadow-sm">
        <aside className="flex min-h-0 flex-col border-r">
          <div className="border-b p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 size-4 text-muted-foreground" />
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter threads…"
                className="pl-8" aria-label="Filter threads" />
            </div>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto" data-testid="thread-list">
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="p-3"><Skeleton className="h-14 w-full" /></li>
            ))}
            {!isLoading && visible.length === 0 && (
              <li className="p-6 text-center text-sm text-muted-foreground">No active threads.</li>
            )}
            {visible.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  data-testid={`thread-${t.id}`}
                  onClick={() => router.replace(`${pathname}?issue=${t.id}`, { scroll: false })}
                  className={cn(
                    "flex w-full gap-3 border-b border-l-[3px] px-3 py-3 text-left transition-colors hover:bg-muted/50",
                    t.id === selectedId ? "border-l-az-berry bg-[#fbe6f1]/40" : "border-l-transparent",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">{issueKey(t.id)}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{timeAgo(t.last_activity_at)}</span>
                    </div>
                    <div className={cn("truncate text-sm", t.unread_count > 0 ? "font-semibold" : "font-medium")}>{t.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {t.last_comment ? <><span className="font-medium">{t.last_comment_by}:</span> {t.last_comment}</> : "No messages yet"}
                    </div>
                  </div>
                  {t.unread_count > 0 && (
                    <span data-testid="unread-badge"
                      className="mt-5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-az-berry px-1.5 text-[11px] font-semibold text-white">
                      {t.unread_count}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="flex min-h-0 flex-col">
          {selectedId === null ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
              <MessagesSquare className="size-10 text-az-navy/30" />
              <p className="text-sm">Select a thread to start the conversation.</p>
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px] text-muted-foreground">{issueKey(selectedId)}</div>
                  <h2 className="truncate font-semibold text-az-navy" data-testid="thread-title">{current?.title ?? "…"}</h2>
                </div>
                {current && <><StatusPill value={current.status} /><PriorityPill value={current.priority} /></>}
                <button type="button" className="text-xs font-medium text-az-berry hover:underline"
                  onClick={() => router.push(`/issues?issue=${selectedId}`)}>
                  Open issue
                </button>
              </header>
              <ChatThread key={selectedId} issueId={selectedId} />
            </>
          )}
        </section>
      </div>
    </>
  );
}
