import Link from "next/link";

import { CommandPalette } from "./command-palette";
import { NavTabs } from "./nav-tabs";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 bg-brand-navy text-white shadow-md">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-6">
        <Link href="/issues" className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight">KTasks</span>
          <span className="hidden text-[11px] font-medium uppercase tracking-widest text-white/60 lg:inline">
            Issues &amp; Improvements
          </span>
        </Link>
        <NavTabs />
        <div className="ml-auto flex items-center gap-3">
          <CommandPalette />
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
