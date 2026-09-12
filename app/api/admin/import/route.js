import { db } from "@/lib/db";
import { parseShopExport, restoreCollections, summarizeRestore } from "@/lib/data-export";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return Response.json({ error: "Only admins can import shop data." }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file === "string" || typeof file.text !== "function") {
    return Response.json({ error: "Choose a Stockly export JSON file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Export file must be 8MB or smaller." }, { status: 400 });
  }

  const parsed = parseShopExport(await file.text());
  if (parsed.error) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const summary = await restoreCollections(db, parsed.payload.collections);
  return Response.json({ ok: true, ...summarizeRestore(summary), summary });
}
