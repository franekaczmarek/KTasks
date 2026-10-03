"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface Option {
  value: string;
  label: React.ReactNode;
}

/** Single-value select with labelled options (Base UI needs `items` to render the selected label). */
export function SimpleSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  className,
  id,
  disabled,
  "aria-label": ariaLabel,
}: {
  value: string | null;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(v) => v !== null && onChange(v as string)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={className ?? "w-full"} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
