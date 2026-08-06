import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set");
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const expenses = client.db().collection("expense");

const res = await expenses.updateMany(
  { $or: [{ status: { $exists: false } }, { status: null }] },
  { $set: { status: "approved", updatedAt: new Date() } },
);

console.log(
  `Legacy expenses migrated to approved: matched ${res.matchedCount}, modified ${res.modifiedCount}.`,
);
await client.close();
