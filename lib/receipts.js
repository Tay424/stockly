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
 * Store an image file. Uses UploadThing when UPLOADTHING_TOKEN is set;
 * otherwise writes under `public/<folder>` for local/dev demos.
 *
 * @param {File} file
 * @param {{ folder?: string, label?: string, required?: boolean }} [options]
 */
export async function storeImageFile(file, options = {}) {
  const folder = options.folder || "uploads";
  const label = options.label || "Image";
  const required = options.required !== false;

  if (!file || typeof file !== "object" || typeof file.arrayBuffer !== "function") {
    if (!required) return { ok: true, image: null };
    return { ok: false, reason: `A ${label.toLowerCase()} is required.` };
  }

  // Empty optional file inputs still look like File objects with size 0.
  if (!required && Number(file.size) === 0) {
    return { ok: true, image: null };
  }

  const mime = String(file.type || "").toLowerCase();
  if (!ALLOWED.has(mime)) {
    return { ok: false, reason: `${label} must be a JPEG, PNG, or WebP image.` };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, reason: `${label} must be 4MB or smaller.` };
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
        return { ok: false, reason: err?.message || `${label} upload failed.` };
      }
      return {
        ok: true,
        image: {
          url: data.ufsUrl || data.url,
          key: data.key,
          mime,
          name: data.name || file.name || label.toLowerCase(),
        },
      };
    } catch (error) {
      return { ok: false, reason: error?.message || `${label} upload failed.` };
    }
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const key = `${Date.now()}-${randomUUID()}.${extensionFor(mime)}`;
  const dir = path.join(process.cwd(), "public", folder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, key), buf);

  return {
    ok: true,
    image: {
      url: `/${folder}/${key}`,
      key,
      mime,
      name: file.name || key,
    },
  };
}

/** Receipt helper — required image under public/receipts (or UploadThing). */
export async function storeReceiptFile(file) {
  const result = await storeImageFile(file, {
    folder: "receipts",
    label: "Receipt",
    required: true,
  });
  if (!result.ok) return result;
  return { ok: true, receipt: result.image };
}

/** Optional product image under public/products (or UploadThing). */
export async function storeProductImage(file) {
  const result = await storeImageFile(file, {
    folder: "products",
    label: "Product image",
    required: false,
  });
  if (!result.ok) return result;
  return { ok: true, image: result.image };
}
