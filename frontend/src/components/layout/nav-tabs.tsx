"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

export const TABS = [
  { href: "/issues", label: "Issues" },
  { href: "/discussions", label: "Discussions" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/work", label: "Work" },
] as const;

export function NavTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex h-full items-stretch gap-1" aria-label="Main">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center border-b-[3px] px-3 text-sm font-medium transition-colors",
              active ? "border-brand-berry text-white" : "border-transparent text-white/70 hover:text-white",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
