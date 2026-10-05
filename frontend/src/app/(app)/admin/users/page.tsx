"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { Copy, KeyRound, MoreHorizontal, Search, ShieldCheck, ShieldOff, UserCheck, UserPlus, UserX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Pill } from "@/components/issues/pills";
import { PageHeader } from "@/components/page-header";
import { SimpleSelect } from "@/components/simple-select";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMe } from "@/hooks/use-me";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import type { Role, User } from "@/lib/types";

interface AdminUser extends User {
  created_at: string;
  lead_of_areas: string[];
  backup_for_count: number;
}

const ROLE_OPTIONS = [{ value: "employee", label: "Employee" }, { value: "lead", label: "Lead" }];

function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    queryClient.invalidateQueries({ queryKey: ["users"] });
  };
}

export default function UserManagementPage() {
  const { data: me } = useMe();
  const [filter, setFilter] = useState("");
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<AdminUser[]>("/admin/users"),
    enabled: me?.role === "lead",
  });

  if (me && me.role !== "lead") {
    return <PageHeader title="User management" description="Only Leads can manage user accounts." />;
  }

  const q = filter.trim().toLowerCase();
  const visible = (users ?? []).filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q));

  return (
    <>
      <PageHeader
        title="User management"
        description="Create accounts, grant the Lead role, reset passwords and deactivate leavers. People can also self-register as Employees."
        actions={<AddUserDialog onCreated={setSecret} />}
      />
      <div className="mb-4 flex items-center gap-3">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2 size-4 text-muted-foreground" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search name or email…"
            className="bg-card pl-8" aria-label="Search users" />
        </div>
        {users && (
          <span className="text-xs text-muted-foreground">
            {users.filter((u) => u.is_active).length} active · {users.filter((u) => u.role === "lead" && u.is_active).length} Leads
          </span>
        )}
      </div>

      {isLoading || !users ? <Skeleton className="h-72 rounded-2xl" /> : (
        <div className="overflow-hidden rounded-2xl bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="pl-5">Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-28">Role</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead>Responsibilities</TableHead>
                <TableHead className="w-32">Joined</TableHead>
                <TableHead className="w-14 pr-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((u) => (
                <TableRow key={u.id} data-testid={`user-row-${u.email}`} className={cn(!u.is_active && "opacity-60")}>
                  <TableCell className="pl-5 font-medium">
                    {u.name}{u.id === me?.id && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Pill className={u.role === "lead" ? "bg-[#fbe6f1] text-brand-plum" : "bg-[#e6ecf5] text-brand-navy"}>
                      {u.role === "lead" ? "Lead" : "Employee"}
                    </Pill>
                  </TableCell>
                  <TableCell>
                    <Pill className={u.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}>
                      {u.is_active ? "Active" : "Deactivated"}
                    </Pill>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {[
                      u.lead_of_areas.length ? `Lead of ${u.lead_of_areas.join(", ")}` : null,
                      u.backup_for_count ? `Backup for ${u.backup_for_count}` : null,
                    ].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="text-sm">{fmtDate(u.created_at)}</TableCell>
                  <TableCell className="pr-5">
                    <UserActions user={u} isSelf={u.id === me?.id} onPassword={setSecret} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <PasswordDialog secret={secret} onClose={() => setSecret(null)} />
    </>
  );
}

function UserActions({ user, isSelf, onPassword }: {
  user: AdminUser; isSelf: boolean; onPassword: (s: { email: string; password: string }) => void;
}) {
  const invalidate = useInvalidateUsers();
  const patch = useMutation({
    mutationFn: (body: Partial<{ role: Role; is_active: boolean }>) => api.patch(`/admin/users/${user.id}`, body),
    onSuccess: (_, body) => {
      invalidate();
      toast.success(body.role ? `${user.name} is now ${body.role === "lead" ? "a Lead" : "an Employee"}`
        : body.is_active ? `${user.name} reactivated` : `${user.name} deactivated`);
    },
    onError: (e) => toast.error(e.message),
  });
  const reset = useMutation({
    mutationFn: () => api.post<{ temporary_password: string }>(`/admin/users/${user.id}/reset-password`, {}),
    onSuccess: (r) => onPassword({ email: user.email, password: r.temporary_password }),
    onError: (e) => toast.error(e.message),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Actions for ${user.name}`}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {user.role === "employee" ? (
          <DropdownMenuItem onClick={() => patch.mutate({ role: "lead" })}><ShieldCheck /> Make Lead</DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled={isSelf} onClick={() => patch.mutate({ role: "employee" })}>
            <ShieldOff /> Make Employee
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => reset.mutate()}><KeyRound /> Reset password</DropdownMenuItem>
        <DropdownMenuSeparator />
        {user.is_active ? (
          <DropdownMenuItem variant="destructive" disabled={isSelf} onClick={() => patch.mutate({ is_active: false })}>
            <UserX /> Deactivate
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => patch.mutate({ is_active: true })}><UserCheck /> Reactivate</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AddUserDialog({ onCreated }: { onCreated: (s: { email: string; password: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [password, setPassword] = useState("");
  const invalidate = useInvalidateUsers();

  const create = useMutation({
    mutationFn: () => api.post<{ user: User; temporary_password: string | null }>("/admin/users", {
      name: name.trim(), email: email.trim(), role, ...(password && { password }),
    }),
    onSuccess: (r) => {
      invalidate();
      toast.success(`Account created for ${r.user.name}`);
      if (r.temporary_password) onCreated({ email: r.user.email, password: r.temporary_password });
      setOpen(false);
      setName(""); setEmail(""); setRole("employee"); setPassword("");
    },
    onError: (e) => toast.error(e.message),
  });
  const valid = name.trim().length >= 2 && email.includes("@") && (!password || password.length >= 8);

  return (
    <>
      <Button className="bg-brand-navy hover:bg-brand-navy/90" onClick={() => setOpen(true)}><UserPlus /> Add user</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-brand-navy">Add user</DialogTitle>
            <DialogDescription>The account is ready to use immediately. Leave the password empty to generate one.</DialogDescription>
          </DialogHeader>
          <form id="add-user" className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate(); }}>
            <div className="space-y-1.5">
              <Label htmlFor="new-name">Full name</Label>
              <Input id="new-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-email">Email</Label>
              <Input id="new-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-role">Role</Label>
              <SimpleSelect id="new-role" aria-label="Role" value={role} options={ROLE_OPTIONS}
                onChange={(v) => setRole(v as Role)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Password (optional, min. 8 characters)</Label>
              <Input id="new-password" type="password" autoComplete="new-password" value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="Generate a temporary password" />
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="add-user" disabled={!valid || create.isPending} className="bg-brand-navy hover:bg-brand-navy/90">
              Create account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Shows a generated password exactly once so the Lead can hand it over. */
function PasswordDialog({ secret, onClose }: { secret: { email: string; password: string } | null; onClose: () => void }) {
  return (
    <Dialog open={secret !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="password-dialog">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">Temporary password</DialogTitle>
          <DialogDescription>
            Share it securely with {secret?.email}. It is shown only once and is not stored in KTasks.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-xl bg-muted p-3">
          <code className="flex-1 font-mono text-base" data-testid="temp-password">{secret?.password}</code>
          <Button size="sm" variant="outline" onClick={() => {
            navigator.clipboard.writeText(secret?.password ?? "").then(() => toast.success("Copied"));
          }}>
            <Copy /> Copy
          </Button>
        </div>
        <DialogFooter><Button onClick={onClose}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
