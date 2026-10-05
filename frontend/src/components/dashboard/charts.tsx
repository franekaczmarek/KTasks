"use client";

import { cn } from "cn";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { issueKey } from "@/lib/format";
import type { DashboardData, Effort, Priority } from "@/lib/types";

/* Validated with the dataviz palette validator:
   - BAR: single-series mark color (navy step inside the categorical lightness band)
   - RAMP: ordinal navy ramp (monotone L, light end >= 2:1 vs white) */
export const BAR = "#2c4f8c";
const RAMP = ["#a3b6d8", "#7b96c6", "#5376b0", "#2c4f8c", "#00205b"];
const EMPTY = "#f1f3f7";

/* ---------- Stat tile ---------- */

export function StatTile({ label, value, hint, children, testId }: {
  label: string; value: string; hint?: React.ReactNode; children?: React.ReactNode; testId?: string;
}) {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-sm" data-testid={testId}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight text-brand-navy" data-testid={testId && `${testId}-value`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      {children}
    </div>
  );
}

/** Meter: fill severity by status (with icon + label), track is a lighter step of the same ramp. */
export function ComplianceMeter({ pct }: { pct: number }) {
  const s = pct >= 90
    ? { fill: "bg-emerald-600", track: "bg-emerald-100", text: "Good", Icon: CheckCircle2, ink: "text-emerald-700" }
    : pct >= 75
      ? { fill: "bg-amber-500", track: "bg-amber-100", text: "Watch", Icon: AlertTriangle, ink: "text-amber-700" }
      : { fill: "bg-rose-600", track: "bg-rose-100", text: "Poor", Icon: XCircle, ink: "text-rose-700" };
  return (
    <div className="mt-3">
      <div className={cn("h-2 overflow-hidden rounded-full", s.track)} role="meter" aria-valuenow={pct}
        aria-valuemin={0} aria-valuemax={100} aria-label="SLA compliance">
        <div className={cn("h-full rounded-full", s.fill)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className={cn("mt-1 flex items-center gap-1 text-xs font-medium", s.ink)}>
        <s.Icon className="size-3.5" /> {s.text}
      </div>
    </div>
  );
}

/* ---------- Card with chart/table toggle ---------- */

export function ChartCard({ title, subtitle, table, children, className, testId }: {
  title: string; subtitle?: string; table: React.ReactNode; children: React.ReactNode; className?: string; testId?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className={cn("rounded-2xl bg-card p-5 shadow-sm", className)} data-testid={testId}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-brand-navy">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex rounded-lg bg-muted p-0.5 text-xs" role="tablist" aria-label={`${title} view`}>
          {(["chart", "table"] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={cn("rounded-md px-2 py-1 font-medium capitalize",
                view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
              {v}
            </button>
          ))}
        </div>
      </header>
      {view === "chart" ? children : table}
    </section>
  );
}

export function DataTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-muted-foreground">
          {headers.map((h, i) => <th key={h} className={cn("py-1.5 font-medium", i > 0 && "text-right")}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b last:border-0">
            {r.map((c, j) => (
              <td key={j} className={cn("py-1.5", j > 0 && "text-right tabular-nums")}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------- Horizontal bar (single series) ---------- */

export function HBarChart({ data, format = (v) => String(v), unit, empty = "No data yet." }: {
  data: { label: string; value: number; detail?: string }[];
  format?: (v: number) => string;
  unit?: string;
  empty?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 0);
  if (!data.length) return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-0.5" aria-label="Bar chart">
      {data.map((d) => (
        <li key={d.label} className="group relative grid grid-cols-[minmax(7rem,38%)_1fr] items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-muted/50">
          <span className="truncate text-sm text-foreground" title={d.label}>{d.label}</span>
          <span className="flex items-center gap-2">
            {/* <=24px thick, 4px rounded data-end, square at the baseline */}
            {d.value > 0 && max > 0 && (
              <span className="h-5 rounded-r-[4px]" style={{ width: `${(d.value / max) * 85}%`, background: BAR }} />
            )}
            <span className="text-xs font-medium tabular-nums text-muted-foreground">
              {format(d.value)}{unit ? ` ${unit}` : ""}
            </span>
          </span>
          <span role="tooltip"
            className="pointer-events-none absolute -top-8 left-1/3 z-10 hidden whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md group-hover:block">
            {d.label}: {format(d.value)}{unit ? ` ${unit}` : ""}{d.detail ? ` · ${d.detail}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Quick Wins heatmap: Priority (impact) x Effort ---------- */

const ROWS: Priority[] = ["Critical", "High", "Medium", "Low"];
const COLS: Effort[] = ["Low", "Medium", "High"];

export function QuickWinsMatrix({ cells }: { cells: DashboardData["quick_wins"] }) {
  const max = Math.max(...cells.map((c) => c.count), 1);
  const step = (n: number) => (n === 0 ? -1 : Math.min(RAMP.length - 1, Math.floor(((n - 1) / max) * RAMP.length)));
  const get = (p: Priority, e: Effort) => cells.find((c) => c.priority === p && c.effort === e)!;

  return (
    <div>
      <div className="grid grid-cols-[5.5rem_repeat(3,1fr)] gap-0.5">
        <div />
        {COLS.map((e) => <div key={e} className="pb-1 text-center text-xs text-muted-foreground">{e} effort</div>)}
        {ROWS.map((p) => (
          <div key={p} className="contents">
            <div className="flex items-center text-xs text-muted-foreground">{p}</div>
            {COLS.map((e) => {
              const c = get(p, e);
              const s = step(c.count);
              const dark = s >= 2;
              return (
                <div key={e} data-testid={`qw-${p}-${e}`} data-quick-win={c.quick_win || undefined}
                  className={cn("group relative flex h-16 flex-col items-center justify-center rounded-[4px]",
                    c.quick_win && "outline-2 -outline-offset-2 outline-solid outline-brand-berry")}
                  style={{ background: s < 0 ? EMPTY : RAMP[s] }}
                  tabIndex={c.count ? 0 : -1}
                  aria-label={`${p} priority, ${e} effort: ${c.count} open issues${c.quick_win ? " (quick win)" : ""}`}>
                  <span className={cn("text-lg font-semibold", s < 0 ? "text-muted-foreground/60" : dark ? "text-white" : "text-brand-navy")}>
                    {c.count}
                  </span>
                  {c.quick_win && (
                    <span className={cn("text-[10px] font-medium uppercase tracking-wide", dark ? "text-white" : "text-brand-plum")}>
                      Quick win
                    </span>
                  )}
                  {c.count > 0 && (
                    <div role="tooltip"
                      className="absolute left-1/2 top-full z-20 mt-1 hidden w-64 -translate-x-1/2 rounded-lg bg-foreground p-2 text-xs text-background shadow-lg group-hover:block group-focus:block">
                      <div className="mb-1 font-semibold">{p} × {e} effort · {c.count} open</div>
                      <ul className="space-y-0.5">
                        {c.issues.slice(0, 6).map((i) => (
                          <li key={i.id} className="truncate">
                            <Link href={`/issues?issue=${i.id}`} className="hover:underline">{issueKey(i.id)} {i.title}</Link>
                          </li>
                        ))}
                        {c.issues.length > 6 && <li className="opacity-70">+{c.issues.length - 6} more</li>}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>↑ Impact (priority) · → Effort</span>
        <span className="flex items-center gap-1" aria-label="Scale: fewer to more open issues">
          fewer
          {RAMP.map((c) => <span key={c} className="h-2.5 w-5 rounded-[2px]" style={{ background: c }} />)}
          more
        </span>
      </div>
    </div>
  );
}
