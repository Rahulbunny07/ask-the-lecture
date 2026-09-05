import mongoose from "mongoose";

let connected = false;

/** Mongo is optional: without a URI the server falls back to an in-memory store. */
export function hasMongo(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

export async function connectDb(): Promise<boolean> {
  if (!hasMongo()) return false;
  if (connected) return true;

  await mongoose.connect(process.env.MONGODB_URI as string, {
    serverSelectionTimeoutMS: 8000,
  });
  connected = true;
  return true;
}
