import { db } from "@/lib/db";
import {
  collectCollections,
  createShopExport,
  exportFilename,
  stringifyShopExport,
} from "@/lib/data-export";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return Response.json({ error: "Only admins can export shop data." }, { status: 403 });
  }

  const { database, collections } = await collectCollections(db);
  const body = stringifyShopExport(createShopExport({ database, collections }));
  const filename = exportFilename();

  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
