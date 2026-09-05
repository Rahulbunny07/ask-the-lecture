import express from "express";

const app = express();
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "ask-the-lecture" });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`server listening on :${port}`);
});
