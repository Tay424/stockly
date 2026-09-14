import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");

/**
 * Cache the client + connect promise on globalThis so:
 * - Next.js HMR in dev reuses one pool
 * - Vercel serverless warm instances don't reconnect on every request
 */
const globalForMongo = globalThis;

const client =
  globalForMongo._mongoClient ??
  new MongoClient(uri, {
    // Serverless-friendly: don't keep idle sockets forever; fail fast on cold start.
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 60_000,
    serverSelectionTimeoutMS: 8_000,
    connectTimeoutMS: 8_000,
  });

globalForMongo._mongoClient = client;

if (!globalForMongo._mongoConnectPromise) {
  globalForMongo._mongoConnectPromise = client.connect().catch((err) => {
    // Allow a later request to retry connect after a transient failure.
    globalForMongo._mongoConnectPromise = null;
    throw err;
  });
}

/** Await before the first DB operation on a cold instance. */
export async function ensureMongoConnected() {
  await globalForMongo._mongoConnectPromise;
  return client;
}

export { client };
export const db = client.db(); // database name comes from MONGODB_URI
