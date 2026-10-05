"use client";

import { SimpleSelect } from "@/components/simple-select";
import { useMe } from "@/hooks/use-me";
import { isStaff } from "@/lib/roles";
import type { Visibility } from "@/lib/types";

const OPTIONS = [
  { value: "all", label: "Hidden & visible" },
  { value: "hidden", label: "Hidden only" },
  { value: "visible", label: "Visible only" },
];

/** Staff-only filter for issues hidden from employees (employees never see hidden issues they're not part of). */
export function VisibilityFilter({ value, onChange, className = "w-44 bg-card" }: {
  value: Visibility; onChange: (v: Visibility) => void; className?: string;
}) {
  const { data: me } = useMe();
  if (!isStaff(me)) return null;
  return (
    <SimpleSelect className={className} aria-label="Visibility filter" value={value} options={OPTIONS}
      onChange={(v) => onChange(v as Visibility)} />
  );
}
