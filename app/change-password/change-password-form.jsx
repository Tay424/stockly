"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { destinationFor } from "@/lib/destination";

import { clearMustChangePasswordAction } from "./actions";

export function ChangePasswordForm({ name }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      toast.error("Choose a password different from the temporary one.");
      return;
    }

    setPending(true);

    // Client-side so Better Auth can rotate the session cookie when
    // revokeOtherSessions creates a fresh session.
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });

    if (error) {
      setPending(false);
      toast.error(error.message ?? "Temporary password is incorrect.");
      return;
    }

    const result = await clearMustChangePasswordAction();
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Password updated. Welcome aboard.");
    router.push(destinationFor({ role: result.role, mustChangePassword: false }));
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Choose your password</CardTitle>
        <CardDescription>
          Hi {name}. Enter the temporary password your admin gave you, then pick a new one
          you will use from now on.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="currentPassword">Temporary password</Label>
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save password & continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
