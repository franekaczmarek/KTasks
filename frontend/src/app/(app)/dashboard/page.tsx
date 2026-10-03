"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  ChartCard, ComplianceMeter, DataTable, HBarChart, QuickWinsMatrix, StatTile,
} from "@/components/dashboard/charts";
import { PageHeader } from "@/components/page-header";
import { SimpleSelect } from "@/components/simple-select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { AREAS, type DashboardData } from "@/lib/types";

const PERIODS = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
  { value: "all", label: "All time" },
];

const bd = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(1)} bd`);

export default function DashboardPage() {
  const [area, setArea] = useState("all");
  const [period, setPeriod] = useState("all");
  const qs = new URLSearchParams({
    ...(area !== "all" && { area }),
    ...(period !== "all" && { days: period }),
  }).toString();

  // Keep the previous render (dimmed) while filters refetch: no skeleton flash.
  const { data, isFetching } = useQuery({
    queryKey: ["dashboard", qs],
    queryFn: () => api.get<DashboardData>(`/dashboard?${qs}`),
    placeholderData: keepPreviousData,
  });

  async function exportReport(format: "pdf" | "xlsx") {
    try {
      await api.download(`/reports/export?format=${format}${qs ? `&${qs}` : ""}`, `ktasks-report.${format}`);
      toast.success(`${format === "pdf" ? "PDF" : "Excel"} report downloaded`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader title="Dashboard" description="KPIs, SLA compliance, quick wins and root-cause analytics." />
      {/* One filter row scopes every chart below. */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <SimpleSelect className="w-44 bg-card" aria-label="Dashboard area" value={area} onChange={setArea}
          options={[{ value: "all", label: "All areas" }, ...AREAS.map((a) => ({ value: a, label: a }))]} />
        <SimpleSelect className="w-44 bg-card" aria-label="Dashboard period" value={period} onChange={setPeriod}
          options={PERIODS} />
        {data && <span className="text-xs text-muted-foreground">{data.scope.issue_count} issues in scope</span>}
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-az-navy px-3 text-sm font-medium text-white hover:bg-az-navy/90">
              <Download className="size-4" /> Export summary
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportReport("pdf")}><FileText /> PDF report</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportReport("xlsx")}><FileSpreadsheet /> Excel workbook</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {!data ? (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
          <Skeleton className="h-80 rounded-2xl md:col-span-2" /><Skeleton className="h-80 rounded-2xl md:col-span-2" />
        </div>
      ) : (
        <div className={cn("space-y-4 transition-opacity", isFetching && "opacity-60")}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile testId="kpi-response" label="Avg lead response time" value={bd(data.kpis.avg_lead_response_days)}
              hint={`${data.kpis.responded_count} responded · ${data.kpis.awaiting_response} awaiting`} />
            <StatTile testId="kpi-open" label="Open issues" value={data.kpis.open_issues.toLocaleString()}
              hint={`${data.kpis.open_blocked} blocked · ${data.kpis.open_breached} SLA breached`} />
            <StatTile testId="kpi-sla" label="SLA compliance"
              value={data.kpis.sla_compliance_pct == null ? "—" : `${data.kpis.sla_compliance_pct.toFixed(0)}%`}
              hint={`${data.kpis.sla_met_count} of ${data.kpis.sla_finished_count} resolved within target`}>
              {data.kpis.sla_compliance_pct != null && <ComplianceMeter pct={data.kpis.sla_compliance_pct} />}
            </StatTile>
            <StatTile testId="kpi-blockers" label="Time lost to blockers" value={bd(data.blockers.total_days)}
              hint={`${data.blockers.active} active · avg ${bd(data.blockers.avg_days_per_blocked_issue)} per blocked issue`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard testId="chart-quick-wins" title="Quick wins matrix"
              subtitle="Open issues by priority (impact) and estimated effort"
              table={<DataTable headers={["Priority", "Effort", "Open issues"]}
                rows={data.quick_wins.map((c) => [c.priority + (c.quick_win ? " (quick win)" : ""), c.effort, c.count])} />}>
              <QuickWinsMatrix cells={data.quick_wins} />
            </ChartCard>
            <ChartCard testId="chart-root-causes" title="Root cause analysis"
              subtitle="Primary problem source of resolved and closed issues"
              table={<DataTable headers={["Root cause", "Issues"]}
                rows={data.root_causes.map((r) => [r.root_cause, r.count])} />}>
              <HBarChart data={data.root_causes.some((r) => r.count > 0)
                ? data.root_causes.map((r) => ({ label: r.root_cause, value: r.count })) : []}
                empty="No resolved issues in this scope yet." />
            </ChartCard>
          </div>

          <ChartCard testId="chart-blockers" title="Top blocker reasons"
            subtitle="Business days lost per reason (all blockers in scope)"
            table={<DataTable headers={["Reason", "Occurrences", "Business days lost"]}
              rows={data.blockers.top_reasons.map((r) => [r.reason, r.count, r.days.toFixed(1)])} />}>
            <HBarChart unit="bd" format={(v) => v.toFixed(1)}
              data={data.blockers.top_reasons.map((r) => ({
                label: r.reason, value: r.days, detail: `${r.count} occurrence${r.count === 1 ? "" : "s"}`,
              }))}
              empty="No blockers recorded in this scope." />
          </ChartCard>
        </div>
      )}
    </>
  );
}
