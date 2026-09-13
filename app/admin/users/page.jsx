import { headers } from "next/headers";

import { PageHeader } from "@/components/page-header";
import { auth } from "@/lib/auth";
import { ensureLocationsMigrated, listSellableLocations } from "@/lib/locations";
import { requireAdmin } from "@/lib/session";

import { UsersTable } from "./users-table";

export default async function UsersPage() {
  await requireAdmin();

  const [result, locations] = await Promise.all([
    auth.api.listUsers({
      query: {
        limit: 200,
        sortBy: "createdAt",
        sortDirection: "desc",
      },
      headers: await headers(),
    }),
    ensureLocationsMigrated().then(() => listSellableLocations()),
  ]);

  return (
    <>
      <PageHeader
        title="Users"
        description="Create attendants, assign them to Harare or Gweru, and hand over temporary passwords. They set their own password on first sign-in."
      />
      <UsersTable initialUsers={result.users ?? []} initialLocations={locations} />
    </>
  );
}
