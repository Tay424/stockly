import assert from "node:assert/strict";
import { test } from "node:test";

import sharp from "sharp";

import { FULL_MAX_EDGE, THUMB_MAX_EDGE, optimizeReceiptBuffers } from "./receipt-optimize.js";

test("optimizeReceiptBuffers shrinks a large PNG into webp full + thumb", async () => {
  const input = await sharp({
    create: {
      width: 2400,
      height: 1800,
      channels: 3,
      background: { r: 200, g: 120, b: 60 },
    },
  })
    .png()
    .toBuffer();

  const { full, thumb, mime } = await optimizeReceiptBuffers(input);
  assert.equal(mime, "image/webp");
  assert.ok(full.length < input.length, "full should be smaller than original");
  assert.ok(thumb.length <= full.length, "thumb should not exceed full");

  const fullMeta = await sharp(full).metadata();
  const thumbMeta = await sharp(thumb).metadata();
  assert.ok((fullMeta.width ?? 0) <= FULL_MAX_EDGE);
  assert.ok((fullMeta.height ?? 0) <= FULL_MAX_EDGE);
  assert.ok((thumbMeta.width ?? 0) <= THUMB_MAX_EDGE);
  assert.ok((thumbMeta.height ?? 0) <= THUMB_MAX_EDGE);
});
