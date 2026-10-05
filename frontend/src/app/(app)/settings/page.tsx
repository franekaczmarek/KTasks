"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { SimpleSelect } from "@/components/simple-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe, useUsers } from "@/hooks/use-me";
import { api } from "@/lib/api";
import { isStaff, ROLE_LABEL } from "@/lib/roles";
import { AREAS, type Area, type AreaLead, type User } from "@/lib/types";

export default function SettingsPage() {
  const { data: me } = useMe();
  const { data: users = [] } = useUsers();
  const queryClient = useQueryClient();
  const { data: areaLeads, isLoading: areasLoading } = useQuery({
    queryKey: ["area-leads"],
    queryFn: () => api.get<AreaLead[]>("/area-leads"),
  });
  // Staff own areas (Management only a Director). Anyone active can be a backup: an employee backup acts as
  // Lead on the owner's issues while the owner is absent.
  const leads = users.filter(isStaff);
  const ownerOptions = (area: Area) => leads.filter((u) => area !== "Management" || u.role === "director")
    .map((u) => ({ value: u.id, label: `${u.name} · ${ROLE_LABEL[u.role]}` }));
  const backupOptions = users.map((u) => ({ value: u.id, label: `${u.name} · ${ROLE_LABEL[u.role]}` }));

  const setAreaLead = useMutation({
    mutationFn: ({ area, lead_id }: { area: string; lead_id: string }) =>
      api.put<AreaLead[]>(`/area-leads/${area}`, { lead_id }),
    onSuccess: (data) => {
      queryClient.setQueryData(["area-leads"], data);
      toast.success("Area lead updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const patchUser = useMutation({
    mutationFn: ({ id, ...body }: { id: string; is_absent?: boolean; backup_lead_id?: string }) =>
      api.patch<User>(`/users/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["area-leads"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Lead updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const autoClose = useMutation({
    mutationFn: () => api.post<{ closed: number[] }>("/admin/run-auto-close"),
    onSuccess: ({ closed }) => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      toast.success(closed.length ? `Auto-closed ${closed.map((i) => `KT-${i}`).join(", ")}` : "No issues due for auto-close");
    },
    onError: (e) => toast.error(e.message),
  });

  if (me && !isStaff(me)) {
    return <PageHeader title="Lead settings" description="Only Leads and Directors can manage area assignments." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Lead settings"
        description="Area ownership, absences and backups. A backup can be any user, including an Employee." />

      <section className="rounded-2xl bg-card p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-brand-navy">Area leads</h2>
        <div className="divide-y">
          {areasLoading || !areaLeads ? AREAS.map((area) => <Skeleton key={area} className="my-3 h-8 w-full" />) : AREAS.map((area) => {
            const a = areaLeads.find((x) => x.area === area);
            return (
              <div key={area} className="flex flex-wrap items-center gap-4 py-3" data-testid={`area-${area}`}>
                <div className="w-36 font-medium">
                  {area}
                  {area === "Management" && <div className="text-xs font-normal text-muted-foreground">Directors only</div>}
                </div>
                <SimpleSelect className="w-64" aria-label={`${area} lead`} value={a?.lead_id ?? null}
                  placeholder="Not assigned" options={ownerOptions(area)}
                  onChange={(lead_id) => setAreaLead.mutate({ area, lead_id })} />
                <div className="text-sm text-muted-foreground">
                  {a ? (
                    <>
                      Routing to{" "}
                      <span className="font-medium text-foreground" data-testid="effective-lead">{a.effective_lead_name}</span>
                      {a.lead_absent && <Badge className="ml-2 rounded-full bg-amber-100 text-amber-800">Backup active</Badge>}
                    </>
                  ) : "New issues stay unassigned until an owner is set."}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl bg-card p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-brand-navy">Leads, Directors &amp; absences</h2>
        <div className="divide-y">
          {leads.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-4 py-3" data-testid={`lead-${l.email}`}>
              <div className="w-48">
                <div className="font-medium">{l.name}{l.role === "director" && <span className="ml-1.5 text-xs font-normal text-brand-plum">Director</span>}</div>
                <div className="text-xs text-muted-foreground">{l.email}</div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Backup:</span>
                <SimpleSelect className="w-64" aria-label={`${l.name} backup`} value={l.backup_lead_id}
                  placeholder="None" options={backupOptions.filter((o) => o.value !== l.id)}
                  onChange={(backup_lead_id) => patchUser.mutate({ id: l.id, backup_lead_id })} />
              </div>
              <div className="ml-auto flex items-center gap-3">
                {l.is_absent
                  ? <Badge className="rounded-full bg-amber-100 text-amber-800">Absent</Badge>
                  : <Badge className="rounded-full bg-emerald-100 text-emerald-800">Available</Badge>}
                <Button variant="outline" size="sm" disabled={patchUser.isPending}
                  onClick={() => patchUser.mutate({ id: l.id, is_absent: !l.is_absent })}>
                  {l.is_absent ? "Mark available" : "Mark absent"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-4 rounded-2xl bg-card p-6 shadow-sm">
        <div className="flex-1">
          <h2 className="font-semibold text-brand-navy">Auto-close</h2>
          <p className="text-sm text-muted-foreground">
            Resolved issues close automatically after 5 business days without reporter confirmation. The check runs
            hourly; you can trigger it now.
          </p>
        </div>
        <Button variant="outline" disabled={autoClose.isPending} onClick={() => autoClose.mutate()}>
          Run auto-close check
        </Button>
      </section>
    </div>
  );
}
