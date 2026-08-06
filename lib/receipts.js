import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 4 * 1024 * 1024;

function extensionFor(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/**
 * Store a receipt image. Uses UploadThing when UPLOADTHING_TOKEN is set;
 * otherwise writes under public/receipts for local/dev demos.
 */
export async function storeReceiptFile(file) {
  if (!file || typeof file !== "object" || typeof file.arrayBuffer !== "function") {
    return { ok: false, reason: "A receipt image is required." };
  }

  const mime = String(file.type || "").toLowerCase();
  if (!ALLOWED.has(mime)) {
    return { ok: false, reason: "Receipt must be a JPEG, PNG, or WebP image." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, reason: "Receipt must be 4MB or smaller." };
  }

  const token = String(process.env.UPLOADTHING_TOKEN ?? "").trim();
  if (token) {
    try {
      const { UTApi } = await import("uploadthing/server");
      const utapi = new UTApi({ token });
      const uploaded = await utapi.uploadFiles(file);
      const data = uploaded?.data;
      const err = uploaded?.error;
      if (err || !data) {
        return { ok: false, reason: err?.message || "Receipt upload failed." };
      }
      return {
        ok: true,
        receipt: {
          url: data.ufsUrl || data.url,
          key: data.key,
          mime,
          name: data.name || file.name || "receipt",
        },
      };
    } catch (error) {
      return { ok: false, reason: error?.message || "Receipt upload failed." };
    }
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const key = `${Date.now()}-${randomUUID()}.${extensionFor(mime)}`;
  const dir = path.join(process.cwd(), "public", "receipts");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, key), buf);

  return {
    ok: true,
    receipt: {
      url: `/receipts/${key}`,
      key,
      mime,
      name: file.name || key,
    },
  };
}
