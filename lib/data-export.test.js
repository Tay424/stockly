import assert from "node:assert/strict";
import { test } from "node:test";
import { BSON, ObjectId } from "mongodb";

const { EJSON } = BSON;

import {
  EXPORT_KIND,
  EXPORT_VERSION,
  collectCollections,
  createShopExport,
  exportFilename,
  shouldExportCollection,
  stringifyShopExport,
} from "./data-export.js";

test("skips sessions and system collections", () => {
  assert.equal(shouldExportCollection("product"), true);
  assert.equal(shouldExportCollection("sale"), true);
  assert.equal(shouldExportCollection("user"), true);
  assert.equal(shouldExportCollection("account"), true);
  assert.equal(shouldExportCollection("session"), false);
  assert.equal(shouldExportCollection("system.views"), false);
  assert.equal(shouldExportCollection(""), false);
});

test("names the file with the UTC date", () => {
  assert.equal(exportFilename(new Date("2026-09-11T15:00:00Z")), "stockly-export-2026-09-11.json");
});

test("round-trips ObjectIds and Dates through Extended JSON", () => {
  const id = new ObjectId("64b0c0c0c0c0c0c0c0c0c0c0");
  const when = new Date("2026-09-11T12:00:00.000Z");
  const payload = createShopExport({
    database: "stockly",
    exportedAt: when,
    collections: {
      product: [{ _id: id, name: "Soap", createdAt: when }],
    },
  });

  const json = stringifyShopExport(payload);
  const parsed = EJSON.parse(json, { relaxed: true });

  assert.equal(parsed.version, EXPORT_VERSION);
  assert.equal(parsed.kind, EXPORT_KIND);
  assert.equal(parsed.database, "stockly");
  assert.equal(parsed.exportedAt.getTime(), when.getTime());
  assert.equal(String(parsed.collections.product[0]._id), String(id));
  assert.equal(parsed.collections.product[0].createdAt.getTime(), when.getTime());
  assert.match(json, /\$oid/);
  assert.match(json, /\$date/);
});

test("collectCollections dumps sorted collections and skips session", async () => {
  const productId = new ObjectId();
  const fakeDb = {
    databaseName: "stockly",
    listCollections() {
      return {
        toArray: async () => [{ name: "session" }, { name: "product" }, { name: "system.indexes" }],
      };
    },
    collection(name) {
      assert.equal(name, "product");
      return {
        find() {
          return {
            sort() {
              return { toArray: async () => [{ _id: productId, name: "Soap" }] };
            },
          };
        },
      };
    },
  };

  const { database, collections } = await collectCollections(fakeDb);
  assert.equal(database, "stockly");
  assert.deepEqual(Object.keys(collections), ["product"]);
  assert.equal(collections.product[0].name, "Soap");
});
