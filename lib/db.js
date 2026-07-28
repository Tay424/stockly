import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");

// ponytail: cached on globalThis so dev HMR reuses one connection pool
const client = globalThis._mongoClient ?? new MongoClient(uri);
globalThis._mongoClient = client;

export { client };
export const db = client.db(); // database name comes from MONGODB_URI
