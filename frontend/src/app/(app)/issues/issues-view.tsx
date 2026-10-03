"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { IssueDrawer } from "@/components/issues/issue-drawer";
import { IssuesTable } from "@/components/issues/issues-table";
import { NewIssueDialog } from "@/components/issues/new-issue-dialog";
import { ResolutionPanel } from "@/components/issues/resolution-panel";
import { PageHeader } from "@/components/page-header";
import { SimpleSelect } from "@/components/simple-select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { AREAS, type Issue } from "@/lib/types";

const SCOPES = [
  { value: "all", label: "All issues" },
  { value: "mine", label: "Reported by me" },
  { value: "assigned", label: "Assigned to me" },
];
const STATUS_FILTERS = [
  { value: "open", label: "Open (not closed)" },
  { value: "any", label: "Any status" },
  { value: "New", label: "New" },
  { value: "In Progress", label: "In Progress" },
  { value: "Resolved", label: "Resolved" },
  { value: "Closed", label: "Closed" },
];

export function IssuesView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = params.get("issue") ? Number(params.get("issue")) : null;
  const [scope, setScope] = useState("all");
  const [status, setStatus] = useState("open");
  const [area, setArea] = useState("all");

  const qs = new URLSearchParams({
    scope,
    ...(status !== "any" && { status }),
    ...(area !== "all" && { area }),
  }).toString();
  const { data: issues, isLoading } = useQuery({
    queryKey: ["issues", qs],
    queryFn: () => api.get<Issue[]>(`/issues?${qs}`),
  });

  const select = (id: number | null) =>
    router.replace(id === null ? pathname : `${pathname}?issue=${id}`, { scroll: false });

  return (
    <>
      <PageHeader
        title="Issues"
        description="Report, track and resolve operational issues. SLA is measured in business days."
        actions={<NewIssueDialog onCreated={(i) => select(i.id)} />}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <SimpleSelect className="w-44 bg-card" aria-label="Scope" value={scope} options={SCOPES} onChange={setScope} />
        <SimpleSelect className="w-44 bg-card" aria-label="Status filter" value={status} options={STATUS_FILTERS}
          onChange={setStatus} />
        <SimpleSelect className="w-44 bg-card" aria-label="Area filter" value={area}
          options={[{ value: "all", label: "All areas" }, ...AREAS.map((a) => ({ value: a, label: a }))]}
          onChange={setArea} />
      </div>
      {isLoading || !issues ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <IssuesTable issues={issues} onSelect={select} />
      )}
      <IssueDrawer issueId={selected} onClose={() => select(null)}>
        {(issue) => <ResolutionPanel issue={issue} />}
      </IssueDrawer>
    </>
  );
}
