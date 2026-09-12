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

const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

export function parseShopExport(text) {
  if (typeof text !== "string" || !text.trim()) {
    return { error: "The file is empty." };
  }
  if (Buffer.byteLength(text, "utf8") > MAX_IMPORT_BYTES) {
    return { error: "Export file must be 8MB or smaller." };
  }

  let parsed;
  try {
    parsed = EJSON.parse(text, { relaxed: true });
  } catch {
    return { error: "That file is not valid shop export JSON." };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "That file is not a Stockly shop export." };
  }
  if (parsed.kind !== EXPORT_KIND) {
    return { error: "That file is not a Stockly shop export." };
  }
  if (Number(parsed.version) !== EXPORT_VERSION) {
    return { error: "This export version is not supported." };
  }
  if (!parsed.collections || typeof parsed.collections !== "object" || Array.isArray(parsed.collections)) {
    return { error: "The export is missing collections." };
  }

  const collections = {};
  for (const [name, docs] of Object.entries(parsed.collections)) {
    if (!shouldExportCollection(name)) continue;
    if (!Array.isArray(docs)) {
      return { error: `Collection ${name} is not a list of documents.` };
    }
    for (const doc of docs) {
      if (!doc || typeof doc !== "object" || doc._id == null) {
        return { error: `A document in ${name} is missing an id.` };
      }
    }
    collections[name] = docs;
  }

  return { payload: { ...parsed, collections } };
}

/**
 * Write each exported document back with its original _id. Existing rows with
 * the same id are replaced; new ids are inserted.
 */
export async function restoreCollections(db, collections) {
  const summary = [];
  const names = Object.keys(collections).filter(shouldExportCollection).sort();

  for (const name of names) {
    const docs = collections[name];
    if (!Array.isArray(docs) || docs.length === 0) {
      summary.push({ collection: name, documents: 0, upserted: 0, modified: 0 });
      continue;
    }

    const result = await db.collection(name).bulkWrite(
      docs.map((doc) => ({
        replaceOne: {
          filter: { _id: doc._id },
          replacement: doc,
          upsert: true,
        },
      })),
      { ordered: false },
    );

    summary.push({
      collection: name,
      documents: docs.length,
      upserted: result.upsertedCount ?? 0,
      modified: result.modifiedCount ?? 0,
    });
  }

  return summary;
}

export function summarizeRestore(summary) {
  return {
    collections: summary.length,
    documents: summary.reduce((total, row) => total + (row.documents ?? 0), 0),
  };
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
