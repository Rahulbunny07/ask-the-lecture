import mongoose from "mongoose";

let ready = false;

export function hasMongoUri(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

/** True only once a connection actually succeeded. */
export function mongoReady(): boolean {
  return ready;
}

/**
 * A bad or unreachable connection string must never take the server down -
 * we log loudly and carry on with the in-memory store instead.
 */
export async function connectDb(): Promise<boolean> {
  if (!hasMongoUri()) return false;
  if (ready) return true;

  try {
    await mongoose.connect(process.env.MONGODB_URI as string, {
      serverSelectionTimeoutMS: 8000,
    });
    ready = true;
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`mongo unavailable (${msg}) - falling back to in-memory store`);
    return false;
  }
}
