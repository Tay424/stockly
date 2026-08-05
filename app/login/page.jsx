"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { signIn } from "@/lib/auth-client";
import { destinationFor } from "@/lib/destination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);

    const { data, error } = await signIn.email({
      email: form.get("email"),
      password: form.get("password"),
    });

    setPending(false);

    if (error) {
      toast.error(error.message ?? "Could not sign you in");
      return;
    }

    if (data.user.mustChangePassword) {
      toast.message("Please choose a new password to continue.");
    } else {
      toast.success(`Welcome back, ${data.user.name}`);
    }
    router.push(destinationFor(data.user));
    router.refresh();
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to Stockly</CardTitle>
          <CardDescription>
            Use the email and password your admin sent you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
