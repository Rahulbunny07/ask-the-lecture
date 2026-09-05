import { Router } from "express";
import { getStore } from "./store.js";
import { fetchCaptions, fetchTitle } from "./youtube.js";
import { mergeCues, parseTranscriptText } from "./chunk.js";
import { probeMedia, titleFromUrl } from "./media.js";
import { isSharePage, looksPlayable, resolveSource } from "./source.js";
import { hasGroqKey, transcribeFromUrl } from "./transcribe.js";
import { UNREADABLE_REPLY, looksUnreadable } from "./readable.js";
import { askStream, generateChapters, hasApiKey, type AskMode } from "./llm.js";
import type { Lecture, Segment } from "./types.js";

export const lectures = Router();

interface IngestBody {
  videoUrl?: string;
  transcript?: string;
  title?: string;
  notesText?: string;
}

interface Job {
  videoId: string;
  mediaUrl: string;
  provider: string;
  transcript: string;
}

/**
 * Ingest is too slow to hold a request open - a two hour lecture is about two
 * minutes of audio splitting, transcription and chapter mapping - so anything
 * knowable up front is checked synchronously and the rest runs in the
 * background against a lecture the client can poll.
 */
lectures.post("/", async (req, res) => {
  const body = (req.body ?? {}) as IngestBody;

  if (!body.videoUrl?.trim()) {
    res.status(400).json({ error: "videoUrl is required" });
    return;
  }

  const resolved = resolveSource(body.videoUrl);
  if (resolved.kind === "unusable") {
    res.status(400).json({ error: resolved.reason });
    return;
  }

  const videoId = resolved.kind === "youtube" ? resolved.videoId : "";
  const mediaUrl = resolved.kind === "file" ? resolved.mediaUrl : "";
  let rangeWarning = false;

  if (resolved.kind === "file") {
    const probe = await probeMedia(mediaUrl);

    if (!probe.ok) {
      res.status(422).json({
        error:
          probe.status === 0
            ? `Could not reach that ${resolved.provider} link from the server.`
            : `That ${resolved.provider} link returned ${probe.status}. If it needs a login, the server cannot fetch it.`,
      });
      return;
    }

    // A share page instead of a file is nearly always a sharing setting.
    if (isSharePage(probe.contentType) && !looksPlayable(probe.contentType, mediaUrl)) {
      res.status(422).json({
        error: `That ${resolved.provider} link gave back a web page rather than a video file. Set the file's sharing to "anyone with the link", or paste a direct file link.`,
      });
      return;
    }

    if (!looksPlayable(probe.contentType, mediaUrl)) {
      res.status(422).json({
        error: `That link is not a video or audio file - the server got "${probe.contentType || "no content type"}" back.`,
      });
      return;
    }

    if (!body.transcript?.trim() && !hasGroqKey()) {
      res.status(422).json({
        error: `${resolved.provider} has no caption track, and transcription is not configured on the server. Paste the transcript below and try again.`,
      });
      return;
    }

    rangeWarning = !probe.supportsRanges;
  }

  const title =
    body.title?.trim() ||
    (videoId ? await fetchTitle(videoId) : titleFromUrl(body.videoUrl));

  const lecture = await getStore().createLecture(
    {
      title,
      videoId,
      mediaUrl,
      source: resolved.kind,
      durationSec: 0,
      notesText: body.notesText?.trim() ?? "",
      chapters: [],
      status: "processing",
      stage: "Getting the lecture",
      error: null,
    },
    [],
  );

  res.status(202).json({
    ...lecture,
    warning: rangeWarning
      ? "This video host does not support range requests, so the player cannot jump to a timestamp. Citations will still show, but clicking them will not move the video."
      : null,
  });

  // Deliberately not awaited: the client polls the lecture for progress.
  void processLecture(lecture.id, {
    videoId,
    mediaUrl,
    provider: resolved.provider,
    transcript: body.transcript?.trim() ?? "",
  });
});

async function processLecture(id: string, job: Job): Promise<void> {
  const store = getStore();
  const setStage = (stage: string) => store.updateLecture(id, { stage });

  try {
    let segments: Segment[] = [];

    // A pasted transcript always wins - a human one beats ours on names.
    if (job.transcript) {
      await setStage("Reading your transcript");
      segments = parseTranscriptText(job.transcript);
    } else if (job.videoId) {
      await setStage("Reading the captions");
      segments = mergeCues(await fetchCaptions(job.videoId));
    } else {
      await setStage("Extracting the audio");
      const cues = await transcribeFromUrl(job.mediaUrl, (done, total) => {
        void setStage(`Transcribing part ${done} of ${total}`);
      });
      segments = mergeCues(cues);
    }

    if (segments.length === 0) {
      throw new Error(
        job.videoId
          ? "This video has no captions we can read. Paste the transcript and try again."
          : "We could not get any speech out of that video. Paste the transcript and try again.",
      );
    }

    await store.setSegments(id, segments);
    const durationSec = segments[segments.length - 1]?.endSec ?? 0;
    await store.updateLecture(id, { durationSec, stage: "Mapping the chapters" });

    const lecture = await store.getLecture(id);
    const chapters = lecture ? await generateChapters(lecture, segments) : [];

    await store.updateLecture(id, {
      chapters,
      status: "ready",
      stage: "",
      error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`ingest failed for ${id}:`, message);
    await store.updateLecture(id, {
      status: "failed",
      stage: "",
      error: message,
    });
  }
}

lectures.get("/:id", async (req, res) => {
  const store = getStore();
  const lecture = await store.getLecture(req.params.id);
  if (!lecture) {
    res.status(404).json({ error: "Lecture not found" });
    return;
  }

  const segments = await store.getSegments(req.params.id);
  res.json({ ...lecture, segments });
});

lectures.post("/:id/ask", async (req, res) => {
  const body = (req.body ?? {}) as { question?: unknown; mode?: unknown };
  const question = String(body.question ?? "").trim();
  const requested = String(body.mode ?? "");
  const mode = (["simpler", "points", "analogy"].includes(requested)
    ? requested
    : "default") as AskMode;

  if (!question) {
    res.status(400).json({ error: "question is required" });
    return;
  }
  if (!hasApiKey()) {
    res.status(503).json({ error: "ANTHROPIC_API_KEY is not set on the server" });
    return;
  }

  const store = getStore();
  const lecture: Lecture | null = await store.getLecture(req.params.id);
  if (!lecture) {
    res.status(404).json({ error: "Lecture not found" });
    return;
  }
  if (lecture.status !== "ready") {
    res.status(409).json({ error: "This lecture is still being prepared" });
    return;
  }
  const segments = await store.getSegments(req.params.id);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (payload: unknown) =>
    res.write(`data: ${JSON.stringify(payload)}\n\n`);

  // Answer keyboard mash locally. A model call to say "I cannot read that"
  // costs a real request and twenty seconds to tell the user nothing.
  if (looksUnreadable(question)) {
    send({ type: "delta", text: UNREADABLE_REPLY });
    send({ type: "done" });
    res.end();
    return;
  }

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
