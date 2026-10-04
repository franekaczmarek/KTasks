"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { User } from "@/lib/types";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api.get<User>("/me"), staleTime: 5 * 60_000 });
}

/** Active users (for pickers). Pass includeInactive to resolve historical names, e.g. in the audit log. */
export function useUsers({ includeInactive = false }: { includeInactive?: boolean } = {}) {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/users"),
    staleTime: 60_000,
    select: includeInactive ? undefined : (users) => users.filter((u) => u.is_active),
  });
}
