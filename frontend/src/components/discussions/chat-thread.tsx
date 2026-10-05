"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { Pencil, SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { initials } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/hooks/use-me";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { Comment } from "@/lib/types";

export function ChatThread({ issueId }: { issueId: number }) {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: comments = [], isSuccess } = useQuery({
    queryKey: ["comments", issueId],
    queryFn: () => api.get<Comment[]>(`/issues/${issueId}/comments`),
    refetchInterval: 10_000,
  });

  // Mark the thread as read whenever new messages arrive while it is open.
  const lastId = comments.at(-1)?.id;
  useEffect(() => {
    if (!isSuccess) return;
    api.post(`/issues/${issueId}/read`).then(() => queryClient.invalidateQueries({ queryKey: ["discussions"] }));
  }, [issueId, lastId, isSuccess, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lastId]);

  const send = useMutation({
    mutationFn: (content: string) => api.post<Comment>(`/issues/${issueId}/comments`, { content }),
    onSuccess: (comment) => {
      setDraft("");
      queryClient.setQueryData<Comment[]>(["comments", issueId], (old = []) => [...old, comment]);
      queryClient.invalidateQueries({ queryKey: ["discussions"] });
    },
    onError: (e) => toast.error(e.message),
  });

  function submit() {
    if (draft.trim()) send.mutate(draft.trim());
  }

  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-brand-bg/60 px-5 py-4" data-testid="chat-messages">
        {isSuccess && comments.length === 0 && (
          <p className="pt-10 text-center text-sm text-muted-foreground">No messages yet: start the discussion.</p>
        )}
        {comments.map((c) => (
          <Message key={c.id} comment={c} own={c.user_id === me?.id} issueId={issueId} />
        ))}
        <div ref={bottomRef} />
      </div>
      <form className="flex items-end gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
          aria-label="Message"
          rows={2}
          className="min-h-0 resize-none"
        />
        <Button type="submit" size="icon-lg" aria-label="Send" disabled={!draft.trim() || send.isPending}
          className="bg-brand-navy hover:bg-brand-navy/90">
          <SendHorizontal />
        </Button>
      </form>
    </>
  );
}

function Message({ comment, own, issueId }: { comment: Comment; own: boolean; issueId: number }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.content);

  const save = useMutation({
    mutationFn: () => api.patch<Comment>(`/comments/${comment.id}`, { content: text.trim() }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Comment[]>(["comments", issueId], (old = []) =>
        old.map((c) => (c.id === updated.id ? updated : c)));
      queryClient.invalidateQueries({ queryKey: ["discussions"] });
      setEditing(false);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className={cn("group flex gap-2.5", own && "flex-row-reverse")} data-testid={`comment-${comment.id}`}>
      <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white",
        comment.user_role === "lead" ? "bg-brand-berry" : "bg-brand-navy")}>
        {initials(comment.user_name)}
      </div>
      <div className={cn("max-w-[75%]", own && "items-end text-right")}>
        <div className="mb-0.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{comment.user_name}</span>
          {comment.user_role === "lead" && <span className="ml-1 text-brand-berry">Lead</span>} · {fmtDateTime(comment.created_at)}
          {comment.is_edited && <span className="ml-1 italic">(edited)</span>}
        </div>
        {editing ? (
          <div className="space-y-1.5 text-left">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Edit message" rows={2}
              className="min-w-80 bg-card" />
            <div className="flex justify-end gap-1.5">
              <Button size="xs" variant="ghost" onClick={() => { setEditing(false); setText(comment.content); }}>Cancel</Button>
              <Button size="xs" disabled={!text.trim() || save.isPending} onClick={() => save.mutate()}>Save</Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-1.5">
            {own && (
              <button type="button" aria-label="Edit message" onClick={() => setEditing(true)}
                className="mt-2 rounded p-1 text-muted-foreground opacity-0 transition hover:bg-muted group-hover:opacity-100 focus:opacity-100">
                <Pencil className="size-3.5" />
              </button>
            )}
            <div className={cn("whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-left text-sm shadow-sm",
              own ? "rounded-tr-sm bg-brand-navy text-white" : "rounded-tl-sm bg-card")}>
              {comment.content}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
