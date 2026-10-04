"use client";

import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogOut, Settings, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMe } from "@/hooks/use-me";
import { getSupabase } from "@/lib/supabase/client";

import { ChangePasswordDialog } from "./change-password-dialog";

export function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function UserMenu() {
  const { data: me } = useMe();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [passwordOpen, setPasswordOpen] = useState(false);

  async function signOut() {
    await getSupabase().auth.signOut();
    queryClient.clear();
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="User menu"
          className="flex size-8 items-center justify-center rounded-full bg-az-berry text-xs font-semibold text-white outline-none ring-white/60 focus-visible:ring-2"
        >
          {me ? initials(me.name) : "…"}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {me && (
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <div className="font-medium text-foreground">{me.name}</div>
                <div className="text-xs font-normal text-muted-foreground">
                  {me.email} · <span className="capitalize">{me.role}</span>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
          )}
          <DropdownMenuSeparator />
          {me?.role === "lead" && (
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <Settings /> Lead settings
            </DropdownMenuItem>
          )}
          {me?.role === "lead" && (
            <DropdownMenuItem onClick={() => router.push("/admin/users")}>
              <Users /> User management
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setPasswordOpen(true)}>
            <KeyRound /> Change password
          </DropdownMenuItem>
          <DropdownMenuItem onClick={signOut}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </>
  );
}
