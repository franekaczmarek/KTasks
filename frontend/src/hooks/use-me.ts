"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { User } from "@/lib/types";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api.get<User>("/me"), staleTime: 5 * 60_000 });
}

export function useUsers() {
  return useQuery({ queryKey: ["users"], queryFn: () => api.get<User[]>("/users"), staleTime: 60_000 });
}
