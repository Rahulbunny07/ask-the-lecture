import { Router } from "express";
import { getStore } from "./store.js";
import { fetchCaptions, fetchTitle, parseVideoId } from "./youtube.js";
import { mergeCues, parseTranscriptText } from "./chunk.js";
import { askStream, hasApiKey } from "./llm.js";
import type { Segment } from "./types.js";

export const lectures = Router();

interface IngestBody {
  videoUrl?: string;
  transcript?: string;
  title?: string;
  notesText?: string;
}

lectures.post("/", async (req, res) => {
  const body = (req.body ?? {}) as IngestBody;

  if (!body.videoUrl?.trim()) {
    res.status(400).json({ error: "videoUrl is required" });
    return;
  }

  const videoId = parseVideoId(body.videoUrl);
  if (!videoId) {
    res.status(400).json({ error: "Could not read a YouTube video id from that URL" });
    return;
  }

  let segments: Segment[] = [];
  let source: "youtube" | "paste" = "youtube";
  let captionError: string | null = null;

  try {
    const cues = await fetchCaptions(videoId);
    segments = mergeCues(cues);
  } catch (err) {
    captionError = err instanceof Error ? err.message : String(err);
  }

  // Captions are the fast path; a pasted transcript is the safety net.
  if (segments.length === 0 && body.transcript?.trim()) {
    segments = parseTranscriptText(body.transcript);
    source = "paste";
  }

  if (segments.length === 0) {
    res.status(422).json({
      error:
        "This video has no captions we can read. Paste the transcript into the transcript field and try again.",
      detail: captionError,
    });
    return;
  }

  const title = body.title?.trim() || (await fetchTitle(videoId));
  const durationSec = segments[segments.length - 1]?.endSec ?? 0;

  const lecture = await getStore().createLecture(
    {
      title,
      videoId,
      source,
      durationSec,
      notesText: body.notesText?.trim() ?? "",
    },
    segments,
  );

  res.status(201).json({ ...lecture, segmentCount: segments.length });
});

lectures.get("/:id", async (req, res) => {
  const id = req.params.id;
  const store = getStore();

  const lecture = await store.getLecture(id);
  if (!lecture) {
    res.status(404).json({ error: "Lecture not found" });
    return;
  }

  const segments = await store.getSegments(id);
  res.json({ ...lecture, segments });
});

lectures.post("/:id/ask", async (req, res) => {
  const question = String((req.body as { question?: unknown })?.question ?? "").trim();
  if (!question) {
    res.status(400).json({ error: "question is required" });
    return;
  }
  if (!hasApiKey()) {
    res.status(503).json({ error: "ANTHROPIC_API_KEY is not set on the server" });
    return;
  }

  const store = getStore();
  const lecture = await store.getLecture(req.params.id);
  if (!lecture) {
    res.status(404).json({ error: "Lecture not found" });
    return;
  }
  const segments = await store.getSegments(req.params.id);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (payload: unknown) =>
    res.write(`data: ${JSON.stringify(payload)}

`);

  try {
    for await (const text of askStream({ lecture, segments, question })) {
      send({ type: "delta", text });
    }
    send({ type: "done" });
  } catch (err) {
    // Headers are already out, so the failure has to travel down the stream.
    const message = err instanceof Error ? err.message : "The model call failed";
    console.error("ask failed:", message);
    send({ type: "error", message });
  } finally {
    res.end();
  }
});
