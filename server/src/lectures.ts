import { Router } from "express";
import { getStore } from "./store.js";
import { fetchCaptions, fetchTitle, parseVideoId } from "./youtube.js";
import { mergeCues, parseTranscriptText } from "./chunk.js";
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
