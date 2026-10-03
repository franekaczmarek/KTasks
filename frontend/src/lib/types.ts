export type Role = "employee" | "lead";
export type Area = "Operations" | "Process" | "Improvements";

export const AREAS: Area[] = ["Operations", "Process", "Improvements"];

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  backup_lead_id: string | null;
  is_absent: boolean;
}

export interface AreaLead {
  area: Area;
  lead_id: string;
  lead_name: string;
  lead_absent: boolean;
  effective_lead_id: string;
  effective_lead_name: string;
}

export interface SearchResults {
  issues: { id: number; title: string; status: string; area: Area }[];
  tasks: { id: number; title: string; status: string; issue_id: number; issue_title: string }[];
  discussions: { issue_id: number; issue_title: string; snippet: string }[];
}
