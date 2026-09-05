import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Cue } from "./youtube.js";

const run = promisify(execFile);

// ffmpeg-static is CommonJS and its export is a plain path string, which the
// ESM default import types as a namespace.
const ffmpegPath = createRequire(import.meta.url)("ffmpeg-static") as
  | string
  | null;

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3";

/** Comfortably under Groq's per-request upload limit at our bitrate. */
const CHUNK_SECONDS = 900;
/** Enough to keep the API busy without tripping free-tier rate limits. */
const CONCURRENCY = 4;

export function hasGroqKey(): boolean {
  return Boolean(groqKey());
}

/** The variable is easy to misspell as GROK, so accept both spellings. */
function groqKey(): string | undefined {
  return process.env.GROQ_API_KEY || process.env.GROK_API_KEY;
}

function ffmpeg(): string {
  if (!ffmpegPath) throw new Error("ffmpeg binary is unavailable");
  return ffmpegPath;
}

/**
 * One pass over the network produces every chunk we need.
 *
 * ffmpeg reads the URL directly, so a 250MB lecture never touches the disk;
 * it drops the video, downmixes to mono 16kHz and writes fixed-length pieces
 * in a single transcode. Re-encoding (rather than stream copy) makes the
 * segment boundaries exact, which is what lets each piece's timestamps be
 * shifted back into lecture time by index alone.
 */
async function splitToAudioChunks(url: string, dir: string): Promise<string[]> {
  await run(
    ffmpeg(),
    [
      "-y",
      "-loglevel", "error",
      "-i", url,
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-b:a", "24k",
      "-f", "segment",
      "-segment_time", String(CHUNK_SECONDS),
      "-reset_timestamps", "1",
      join(dir, "chunk_%03d.mp3"),
    ],
    { maxBuffer: 1024 * 1024 * 16 },
  );

  const files = (await readdir(dir))
    .filter((name) => name.endsWith(".mp3"))
    .sort();

  if (files.length === 0) {
    throw new Error("No audio track was found in that video");
  }
  return files.map((name) => join(dir, name));
}

interface GroqSegment {
  start: number;
  end: number;
  text: string;
}

const RATE_LIMITED = 429;
/** Wait out a short cooldown, but never stall an ingest for minutes. */
const MAX_RETRY_WAIT_MS = 75_000;

class QuotaError extends Error {}

function retryAfterMs(message: string): number | null {
  const match = /try again in\s+(?:(\d+)m)?([\d.]+)s/i.exec(message);
  if (!match) return null;
  const minutes = Number(match[1] ?? 0);
  const seconds = Number(match[2] ?? 0);
  return Math.ceil((minutes * 60 + seconds) * 1000) + 1000;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function transcribeChunk(
  file: string,
  offsetSec: number,
  attempt = 0,
): Promise<Cue[]> {
  const key = groqKey();
  if (!key) throw new Error("GROQ_API_KEY is not set");

  const form = new FormData();
  const bytes = await readFile(file);
  form.append("file", new Blob([new Uint8Array(bytes)]), "audio.mp3");
  form.append("model", GROQ_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  const payload = (await res.json()) as {
    segments?: GroqSegment[];
    error?: { message?: string };
  };

  if (!res.ok) {
    const message = payload.error?.message ?? `Groq returned ${res.status}`;

    if (res.status === RATE_LIMITED) {
      const delay = retryAfterMs(message);
      // A short cooldown is worth waiting out; a long one means the recording
      // is simply larger than the account's hourly allowance.
      if (delay !== null && delay <= MAX_RETRY_WAIT_MS && attempt < 2) {
        await wait(delay);
        return transcribeChunk(file, offsetSec, attempt + 1);
      }
      throw new QuotaError(
        "This recording is longer than the transcription account allows per hour. " +
          "Use a shorter lecture, paste a transcript, or raise the Groq tier.",
      );
    }

    throw new Error(message);
  }

  return (payload.segments ?? [])
    .map((s) => ({
      startSec: (Number(s.start) || 0) + offsetSec,
      durSec: Math.max((Number(s.end) || 0) - (Number(s.start) || 0), 0),
      text: String(s.text ?? "").trim(),
    }))
    .filter((cue) => cue.text.length > 0);
}

export interface TranscribeProgress {
  (done: number, total: number): void;
}

/**
 * Turn a lecture URL into timestamped cues.
 *
 * Chunks go out several at a time - a two hour lecture is ten requests, and
 * running them one after another wastes most of the wall clock waiting.
 */
export async function transcribeFromUrl(
  url: string,
  onProgress?: TranscribeProgress,
): Promise<Cue[]> {
  const workDir = await mkdtemp(join(tmpdir(), "atl-"));

  try {
    const chunks = await splitToAudioChunks(url, workDir);
    const results: Cue[][] = new Array(chunks.length);
    let completed = 0;
    let next = 0;

    async function worker(): Promise<void> {
      for (;;) {
        const index = next++;
        if (index >= chunks.length) return;
        results[index] = await transcribeChunk(
          chunks[index] as string,
          index * CHUNK_SECONDS,
        );
        completed += 1;
        onProgress?.(completed, chunks.length);
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker),
    );

    return results.flat();
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
