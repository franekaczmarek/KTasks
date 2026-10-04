"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

const MIN_LENGTH = 8;

/** Self-service password change; the current password is required. */
export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  function reset() {
    setCurrent(""); setNext(""); setConfirm("");
  }

  const change = useMutation({
    mutationFn: () => api.post("/me/password", { current_password: current, new_password: next }),
    onSuccess: () => {
      toast.success("Password changed");
      reset();
      onOpenChange(false);
    },
  });

  const problem =
    next && next.length < MIN_LENGTH ? `The new password needs at least ${MIN_LENGTH} characters.`
      : next && current && next === current ? "The new password must be different from the current one."
        : confirm && next !== confirm ? "Passwords do not match."
          : null;
  const valid = current.length > 0 && next.length >= MIN_LENGTH && next === confirm && next !== current;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); change.reset(); } onOpenChange(o); }}>
      <DialogContent className="sm:max-w-sm" data-testid="change-password-dialog">
        <DialogHeader>
          <DialogTitle className="text-az-navy">Change password</DialogTitle>
          <DialogDescription>Confirm your current password, then choose a new one.</DialogDescription>
        </DialogHeader>
        <form id="change-password" className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); if (valid) change.mutate(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Current password</Label>
            <Input id="current-password" type="password" autoComplete="current-password" value={current} autoFocus
              onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input id="new-password" type="password" autoComplete="new-password" value={next}
              onChange={(e) => setNext(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {(problem || change.error) && (
            <p role="alert" className="text-sm text-destructive">{problem ?? change.error?.message}</p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="change-password" disabled={!valid || change.isPending}
            className="bg-az-navy hover:bg-az-navy/90">
            {change.isPending ? "Saving…" : "Change password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
