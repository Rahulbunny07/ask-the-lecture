import { Router } from "express";
import { getStore } from "./store.js";
import { fetchCaptions, fetchTitle, parseVideoId } from "./youtube.js";
import { mergeCues, parseTranscriptText } from "./chunk.js";
import { looksLikeMediaUrl, probeMedia, titleFromUrl } from "./media.js";
import { askStream, generateChapters, hasApiKey } from "./llm.js";
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
  const mediaUrl = videoId ? "" : body.videoUrl.trim();

  if (!videoId && !looksLikeMediaUrl(mediaUrl)) {
    res.status(400).json({
      error:
        "That is not a YouTube link or a direct video file. Paste a YouTube URL, or a link ending in .mp4 / .webm / .m4a.",
    });
    return;
  }

  let segments: Segment[] = [];
  const source: "youtube" | "file" = videoId ? "youtube" : "file";
  let captionError: string | null = null;
  let rangeWarning = false;

  if (videoId) {
    try {
      segments = mergeCues(await fetchCaptions(videoId));
    } catch (err) {
      captionError = err instanceof Error ? err.message : String(err);
    }
  } else {
    // A direct file carries no caption track, so it must be reachable and
    // will need a transcript from somewhere.
    const probe = await probeMedia(mediaUrl);
    if (!probe.ok) {
      res.status(422).json({
        error:
          probe.status === 0
            ? "Could not reach that video URL from the server."
            : `That video URL returned ${probe.status}. If it needs a login, the server cannot fetch it.`,
      });
      return;
    }
    captionError = "Direct video files carry no caption track.";
    if (!probe.supportsRanges) rangeWarning = true;
  }

  // Captions are the fast path; a pasted transcript is the safety net.
  if (segments.length === 0 && body.transcript?.trim()) {
    segments = parseTranscriptText(body.transcript);
  }

  if (segments.length === 0) {
    res.status(422).json({
      error: videoId
        ? "This video has no captions we can read. Paste the transcript below and try again."
        : "This is a direct video file, so there are no captions to read. Paste the transcript below and try again.",
      detail: captionError,
    });
    return;
  }

  const title =
    body.title?.trim() ||
    (videoId ? await fetchTitle(videoId) : titleFromUrl(mediaUrl));
  const durationSec = segments[segments.length - 1]?.endSec ?? 0;

  const draft = {
    title,
    videoId: videoId ?? "",
    mediaUrl,
    source,
    durationSec,
    notesText: body.notesText?.trim() ?? "",
    chapters: [],
  };
  const chapters = await generateChapters(
    { ...draft, id: "", createdAt: "" },
    segments,
  );

  const lecture = await getStore().createLecture(
    { ...draft, chapters },
    segments,
  );

  res.status(201).json({
    ...lecture,
    segmentCount: segments.length,
    warning: rangeWarning
      ? "This video host does not support range requests, so the player cannot jump to a timestamp. Citations will still show, but clicking them will not move the video."
      : null,
  });
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
  const body = (req.body ?? {}) as { question?: unknown; mode?: unknown };
  const question = String(body.question ?? "").trim();
  const mode = body.mode === "simpler" ? "simpler" : "default";
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
    res.write(`data: ${JSON.stringify(payload)}\n\n`);

  try {
    for await (const text of askStream({ lecture, segments, question, mode })) {
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
