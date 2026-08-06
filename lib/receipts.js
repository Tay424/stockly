import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { optimizeReceiptBuffers } from "./receipt-optimize.js";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 4 * 1024 * 1024;

function toUploadFile(buffer, name, mime) {
  return new File([buffer], name, { type: mime });
}

/**
 * Store a receipt image. Always compresses before save/upload.
 * Uses UploadThing when UPLOADTHING_TOKEN is set; otherwise public/receipts.
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

  let optimized;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    optimized = await optimizeReceiptBuffers(input);
  } catch {
    return { ok: false, reason: "Could not read that image. Try another photo." };
  }

  const id = `${Date.now()}-${randomUUID()}`;
  const fullName = `${id}.webp`;
  const thumbName = `${id}-thumb.webp`;
  const displayName = file.name || fullName;

  const token = String(process.env.UPLOADTHING_TOKEN ?? "").trim();
  if (token) {
    try {
      const { UTApi } = await import("uploadthing/server");
      const utapi = new UTApi({ token });
      const uploaded = await utapi.uploadFiles([
        toUploadFile(optimized.full, fullName, optimized.mime),
        toUploadFile(optimized.thumb, thumbName, optimized.mime),
      ]);

      const fullResult = uploaded?.[0];
      const thumbResult = uploaded?.[1];
      if (fullResult?.error || !fullResult?.data) {
        return {
          ok: false,
          reason: fullResult?.error?.message || "Receipt upload failed.",
        };
      }

      const fullData = fullResult.data;
      const thumbData = thumbResult?.data;
      return {
        ok: true,
        receipt: {
          url: fullData.ufsUrl || fullData.url,
          thumbUrl: thumbData ? thumbData.ufsUrl || thumbData.url : fullData.ufsUrl || fullData.url,
          key: fullData.key,
          thumbKey: thumbData?.key ?? null,
          mime: optimized.mime,
          name: displayName,
        },
      };
    } catch (error) {
      return { ok: false, reason: error?.message || "Receipt upload failed." };
    }
  }

  const dir = path.join(process.cwd(), "public", "receipts");
  await mkdir(dir, { recursive: true });
  await Promise.all([
    writeFile(path.join(dir, fullName), optimized.full),
    writeFile(path.join(dir, thumbName), optimized.thumb),
  ]);

  return {
    ok: true,
    receipt: {
      url: `/receipts/${fullName}`,
      thumbUrl: `/receipts/${thumbName}`,
      key: fullName,
      thumbKey: thumbName,
      mime: optimized.mime,
      name: displayName,
    },
  };
}
