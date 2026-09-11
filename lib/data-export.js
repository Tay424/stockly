import { BSON } from "mongodb";

const { EJSON } = BSON;

export const EXPORT_VERSION = 1;
export const EXPORT_KIND = "stockly-shop-export";

/** Login sessions are machine-specific and not useful on another database. */
export const SKIP_COLLECTIONS = new Set(["session"]);

export function shouldExportCollection(name) {
  if (!name || name.startsWith("system.")) return false;
  return !SKIP_COLLECTIONS.has(name);
}

export function exportFilename(now = new Date()) {
  return `stockly-export-${now.toISOString().slice(0, 10)}.json`;
}

export function createShopExport({ database, collections, exportedAt = new Date() }) {
  return {
    version: EXPORT_VERSION,
    kind: EXPORT_KIND,
    exportedAt,
    database,
    collections,
  };
}

export function stringifyShopExport(payload) {
  return EJSON.stringify(payload, { relaxed: true }, 2);
}

/**
 * Read every non-skipped collection. ObjectIds and Dates stay as BSON so the
 * JSON can be imported into another MongoDB without rewriting ids.
 */
export async function collectCollections(db) {
  const infos = await db.listCollections({}, { nameOnly: true }).toArray();
  const names = infos.map((c) => c.name).filter(shouldExportCollection).sort();
  const collections = {};

  for (const name of names) {
    collections[name] = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
  }

  return { database: db.databaseName, collections };
}
