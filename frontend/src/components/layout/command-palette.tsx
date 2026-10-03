"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckSquare, FileText, LayoutDashboard, MessageSquare, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut,
} from "@/components/ui/command";
import { useDebounced } from "@/hooks/use-debounced";
import { api } from "@/lib/api";
import type { SearchResults } from "@/lib/types";

import { TABS } from "./nav-tabs";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim(), 200);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api.get<SearchResults>(`/search?q=${encodeURIComponent(debounced)}`),
    enabled: open && debounced.length > 0,
  });

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  const hasResults = !!(data?.issues.length || data?.tasks.length || data?.discussions.length);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-8 w-64 items-center gap-2 rounded-lg bg-white/10 px-3 text-sm text-white/70 transition hover:bg-white/15 md:flex"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded bg-white/15 px-1.5 text-[11px] font-medium">Ctrl K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Global search"
        description="Jump to issues, tasks and discussions">
        {/* Results come from the server, so cmdk's client-side filtering is disabled. */}
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search issues, tasks, discussions… (e.g. KT-12)" value={query}
            onValueChange={setQuery} />
          <CommandList>
            {debounced && !isFetching && !hasResults && <CommandEmpty>No results found.</CommandEmpty>}
            {!debounced && (
              <CommandGroup heading="Navigate">
                {TABS.map((t) => (
                  <CommandItem key={t.href} value={`nav-${t.href}`} onSelect={() => go(t.href)}>
                    <LayoutDashboard /> {t.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!!data?.issues.length && (
              <CommandGroup heading="Issues">
                {data.issues.map((i) => (
                  <CommandItem key={`i${i.id}`} value={`issue-${i.id}`} onSelect={() => go(`/issues?issue=${i.id}`)}>
                    <FileText /> <span className="truncate">{i.title}</span>
                    <CommandShortcut>KT-{i.id}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!!data?.tasks.length && (
              <CommandGroup heading="Tasks">
                {data.tasks.map((t) => (
                  <CommandItem key={`t${t.id}`} value={`task-${t.id}`} onSelect={() => go(`/work?issue=${t.issue_id}`)}>
                    <CheckSquare /> <span className="truncate">{t.title}</span>
                    <CommandShortcut>KT-{t.issue_id}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!!data?.discussions.length && (
              <CommandGroup heading="Discussions">
                {data.discussions.map((d) => (
                  <CommandItem key={`d${d.issue_id}`} value={`discussion-${d.issue_id}`}
                    onSelect={() => go(`/discussions?issue=${d.issue_id}`)}>
                    <MessageSquare /> <span className="truncate">{d.issue_title}: {d.snippet}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
