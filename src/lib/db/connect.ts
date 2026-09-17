import mongoose from "mongoose";
import { env } from "@/lib/env";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

// Serverless functions can be re-invoked on a warm container without re-running
// module-level code, but they can also share a global object across invocations.
// Caching the connection on `globalThis` avoids exhausting Atlas's connection
// limit by opening a new connection on every function call.
declare global {
  var _mongooseCache: MongooseCache | undefined;
}

const cache: MongooseCache = global._mongooseCache ?? { conn: null, promise: null };
global._mongooseCache = cache;

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cache.conn) {
    console.log("[db] reusing cached connection");
    return cache.conn;
  }

  if (!cache.promise) {
    console.log("[db] creating new connection");
    cache.promise = mongoose.connect(env.MONGODB_URI);
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
