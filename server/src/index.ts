import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDb } from "./db.js";
import { storeKind } from "./store.js";
import { lectures } from "./lectures.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "ask-the-lecture", store: storeKind() });
});

app.use("/api/lectures", lectures);

const port = Number(process.env.PORT ?? 4000);

async function main() {
  await connectDb();
  console.log(`store: ${storeKind()}`);
  app.listen(port, () => console.log(`server listening on :${port}`));
}

main().catch((err) => {
  console.error("failed to start:", err);
  process.exit(1);
});
