"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, EyeOff, Paperclip, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { useDebounced } from "@/hooks/use-debounced";
import { useMe } from "@/hooks/use-me";
import { api } from "@/lib/api";
import { issueKey } from "@/lib/format";
import { isStaff } from "@/lib/roles";
import { AREAS, EFFORTS, PRIORITIES, type Area, type DuplicateHit, type Effort, type Issue, type Priority } from "@/lib/types";

import { PriorityPill, StatusPill } from "./pills";

const opts = (xs: readonly string[]) => xs.map((x) => ({ value: x, label: x }));

export function NewIssueDialog({ onCreated }: { onCreated: (issue: Issue) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [area, setArea] = useState<Area | null>(null);
  const [priority, setPriority] = useState<Priority | null>(null);
  const [effort, setEffort] = useState<Effort | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [hidden, setHidden] = useState(false);
  const [toBackup, setToBackup] = useState(false);
  const { data: me } = useMe();
  const router = useRouter();
  const queryClient = useQueryClient();
  const debouncedTitle = useDebounced(title.trim(), 300);

  const { data: duplicates = [] } = useQuery({
    queryKey: ["duplicates", debouncedTitle],
    queryFn: () => api.get<DuplicateHit[]>(`/issues/duplicates?q=${encodeURIComponent(debouncedTitle)}`),
    enabled: open && debouncedTitle.length >= 3,
  });

  function reset() {
    setTitle(""); setSummary(""); setArea(null); setPriority(null); setEffort(null); setFiles([]); setHidden(false); setToBackup(false);
  }

  const create = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.set("title", title.trim());
      fd.set("summary", summary.trim());
      fd.set("area", area!);
      fd.set("priority", priority!);
      fd.set("effort", effort!);
      if (hidden) {
        fd.set("hidden", "true");
        if (toBackup) fd.set("visible_to_backup", "true");
      }
      files.forEach((f) => fd.append("files", f));
      return api.post<Issue>("/issues", fd);
    },
    onSuccess: (issue) => {
      toast.success(`${issueKey(issue.id)} created and routed to ${issue.lead_name ?? "triage"}`);
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      setOpen(false);
      reset();
      onCreated(issue);
    },
    onError: (e) => toast.error(e.message),
  });

  const join = useMutation({
    mutationFn: (id: number) => api.post(`/issues/${id}/join`),
    onSuccess: (_, id) => {
      toast.success(`You joined ${issueKey(id)}: you'll be notified about updates`);
      setOpen(false);
      reset();
      router.push(`/discussions?issue=${id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const valid = title.trim().length >= 3 && area && priority && effort;
  const showDupes = debouncedTitle.length >= 3 && duplicates.length > 0;

  return (
    <>
      <Button onClick={() => setOpen(true)} className="bg-brand-navy hover:bg-brand-navy/90">
        <Plus /> Report issue
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-brand-navy">Report a new issue</DialogTitle>
            <DialogDescription>It will be routed to the Lead responsible for the selected area.</DialogDescription>
          </DialogHeader>
          <form
            id="new-issue"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="issue-title">Title</Label>
              <Input id="issue-title" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="Short description of the problem" maxLength={200} autoFocus />
            </div>

            {showDupes && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3" data-testid="duplicate-guard">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-900">
                  <AlertTriangle className="size-4" /> Similar open issues found: join an existing thread instead?
                </div>
                <ul className="space-y-1.5">
                  {duplicates.map((d) => (
                    <li key={d.id} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                      <span className="font-mono text-xs text-muted-foreground">{issueKey(d.id)}</span>
                      <span className="flex-1 truncate">{d.title}</span>
                      <StatusPill value={d.status} />
                      <PriorityPill value={d.priority} />
                      <Button type="button" size="xs" variant="outline" disabled={join.isPending}
                        onClick={() => join.mutate(d.id)}>
                        Join thread
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="issue-summary">Summary</Label>
              <Textarea id="issue-summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={4}
                placeholder="What happened, where, and what is the impact?" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="issue-area">Area</Label>
                <SimpleSelect id="issue-area" aria-label="Area" value={area} options={AREAS.map((a) => ({ value: a, label: a === "Management" ? "Management (Director)" : a }))}
                  onChange={(v) => setArea(v as Area)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="issue-priority">Priority</Label>
                <SimpleSelect id="issue-priority" aria-label="Priority" value={priority} options={opts(PRIORITIES)}
                  onChange={(v) => setPriority(v as Priority)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="issue-effort">Estimated effort</Label>
                <SimpleSelect id="issue-effort" aria-label="Estimated effort" value={effort} options={opts(EFFORTS)}
                  onChange={(v) => setEffort(v as Effort)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="issue-files" className="flex items-center gap-1.5">
                <Paperclip className="size-3.5" /> Attachments (max 5, 10 MB each)
              </Label>
              <Input id="issue-files" type="file" multiple
                onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
            </div>
            {isStaff(me) && (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border p-3 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="size-4 accent-brand-navy" checked={hidden}
                    onChange={(e) => setHidden(e.target.checked)} />
                  <EyeOff className="size-4 text-muted-foreground" /> Hide from employees
                </label>
                {hidden && (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="size-4 accent-brand-navy" checked={toBackup}
                      onChange={(e) => setToBackup(e.target.checked)} />
                    Visible to the owner&apos;s backup
                  </label>
                )}
              </div>
            )}
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="new-issue" disabled={!valid || create.isPending}
              className="bg-brand-navy hover:bg-brand-navy/90">
              {create.isPending ? "Submitting…" : "Submit issue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
