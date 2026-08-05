import { PageHeader } from "@/components/page-header";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/session";
import { headers } from "next/headers";

import { UsersTable } from "./users-table";

export default async function UsersPage() {
  await requireAdmin();

  const result = await auth.api.listUsers({
    query: {
      limit: 200,
      sortBy: "createdAt",
      sortDirection: "desc",
    },
    headers: await headers(),
  });

  return (
    <>
      <PageHeader
        title="Users"
        description="Create attendant accounts, generate a temporary password, and hand it to them. They set their own password on first sign-in."
      />
      <UsersTable initialUsers={result.users ?? []} />
    </>
  );
}
