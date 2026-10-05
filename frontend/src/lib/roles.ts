import type { Role, User } from "@/lib/types";

/** Leads and Directors: admin panels, settings, hiding issues and the visibility filter. */
export const isStaff = (user: Pick<User, "role"> | null | undefined) =>
  user?.role === "lead" || user?.role === "director";

export const ROLE_LABEL: Record<Role, string> = { employee: "Employee", lead: "Lead", director: "Director" };
