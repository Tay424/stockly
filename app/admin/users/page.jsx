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
        description="Create attendants, assign admin or attendant roles, and hand over temporary passwords. They set their own password on first sign-in."
      />
      <UsersTable initialUsers={result.users ?? []} />
    </>
  );
}
