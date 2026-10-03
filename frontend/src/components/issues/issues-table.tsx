"use client";

import { cn } from "cn";
import { Siren } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { issueKey } from "@/lib/format";
import type { Issue } from "@/lib/types";

import { AreaPill, BlockedPill, PriorityPill, SlaBadge, StatusPill } from "./pills";

export function IssuesTable({ issues, onSelect }: { issues: Issue[]; onSelect: (id: number) => void }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="w-24 pl-5">ID</TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="w-32">Area</TableHead>
            <TableHead className="w-28">Priority</TableHead>
            <TableHead className="w-44">Status</TableHead>
            <TableHead className="w-40">Lead</TableHead>
            <TableHead className="w-36 pr-5">SLA</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {issues.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">No issues match these filters.</TableCell>
            </TableRow>
          )}
          {issues.map((issue) => {
            const red = issue.metrics.red_alert;
            return (
              <TableRow
                key={issue.id}
                data-testid={`issue-row-${issue.id}`}
                data-red-alert={red || undefined}
                title={red ? "No scheduled tasks in progress" : undefined}
                onClick={() => onSelect(issue.id)}
                className={cn("cursor-pointer", red && "bg-rose-50 hover:bg-rose-100/70 [&>td:first-child]:border-l-4 [&>td:first-child]:border-l-rose-500")}
              >
                <TableCell className="pl-5 font-mono text-xs text-muted-foreground">{issueKey(issue.id)}</TableCell>
                <TableCell className="max-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-foreground">{issue.title}</span>
                    {red && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-rose-700">
                        <Siren className="size-3.5" /> No scheduled tasks in progress
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell><AreaPill value={issue.area} /></TableCell>
                <TableCell><PriorityPill value={issue.priority} /></TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <StatusPill value={issue.status} />
                    {issue.metrics.is_blocked && <BlockedPill />}
                  </div>
                </TableCell>
                <TableCell className="text-sm">{issue.lead_name ?? "—"}</TableCell>
                <TableCell className="pr-5"><SlaBadge metrics={issue.metrics} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
