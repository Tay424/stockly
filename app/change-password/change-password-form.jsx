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
import { destinationFor } from "@/lib/destination";

import { completeFirstPasswordChangeAction } from "./actions";

export function ChangePasswordForm({ name }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const result = await completeFirstPasswordChangeAction(formData);

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
