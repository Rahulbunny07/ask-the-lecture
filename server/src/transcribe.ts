import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createRequire } from "node:module";
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

/** Groq caps uploads; stay under it with room to spare. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const CHUNK_SECONDS = 900;
/** Refuse absurd downloads rather than filling the disk of a small dyno. */
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;

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

async function download(url: string, target: string): Promise<void> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Download failed with ${res.status}`);
  if (!res.body) throw new Error("Download returned an empty body");

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_DOWNLOAD_BYTES) {
    throw new Error("That video is too large to process");
  }

  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(target));
}

/**
 * Strip the video, downmix to mono and drop to 16kHz - Whisper gains nothing
 * from more, and it turns a few hundred megabytes into a few.
 */
async function extractAudio(source: string, target: string): Promise<void> {
  await run(ffmpeg(), [
    "-y",
    "-loglevel", "error",
    "-i", source,
    "-vn",
    "-ac", "1",
    "-ar", "16000",
    "-b:a", "24k",
    target,
  ], { maxBuffer: 1024 * 1024 * 16 });
}

async function sliceAudio(
  source: string,
  target: string,
  startSec: number,
  durationSec: number,
): Promise<void> {
  await run(ffmpeg(), [
    "-y",
    "-loglevel", "error",
    "-ss", String(startSec),
    "-t", String(durationSec),
    "-i", source,
    "-vn",
    "-ac", "1",
    "-ar", "16000",
    "-b:a", "24k",
    target,
  ], { maxBuffer: 1024 * 1024 * 16 });
}

/** ffmpeg reports duration on stderr; there is no ffprobe in ffmpeg-static. */
async function durationOf(file: string): Promise<number> {
  try {
    await run(ffmpeg(), ["-i", file, "-f", "null", "-"], {
      maxBuffer: 1024 * 1024 * 16,
    });
    return 0;
  } catch (err) {
    const output = String((err as { stderr?: string }).stderr ?? "");
    const match = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(output);
    if (!match) return 0;
    return (
      Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
    );
  }
}

interface GroqSegment {
  start: number;
  end: number;
  text: string;
}

async function transcribeFile(file: string, offsetSec: number): Promise<Cue[]> {
  const key = groqKey();
  if (!key) throw new Error("GROQ_API_KEY is not set");

  const form = new FormData();
  const bytes = await import("node:fs/promises").then((fs) => fs.readFile(file));
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
    throw new Error(payload.error?.message ?? `Groq returned ${res.status}`);
  }

  return (payload.segments ?? [])
    .map((s) => ({
      startSec: (Number(s.start) || 0) + offsetSec,
      durSec: Math.max((Number(s.end) || 0) - (Number(s.start) || 0), 0),
      text: String(s.text ?? "").trim(),
    }))
    .filter((cue) => cue.text.length > 0);
}

/**
 * Download a lecture, reduce it to speech-sized audio and transcribe it with
 * timestamps. Long recordings are sliced so a single upload never exceeds the
 * API limit, with each slice's timestamps shifted back into lecture time.
 */
export async function transcribeFromUrl(url: string): Promise<Cue[]> {
  const workDir = await mkdtemp(join(tmpdir(), "atl-"));
  const videoPath = join(workDir, "source");
  const audioPath = join(workDir, "audio.mp3");

  try {
    await download(url, videoPath);
    await extractAudio(videoPath, audioPath);

    const { size } = await stat(audioPath);
    if (size <= MAX_UPLOAD_BYTES) {
      return await transcribeFile(audioPath, 0);
    }

    const total = await durationOf(audioPath);
    if (total <= 0) throw new Error("Could not read the audio duration");

    const cues: Cue[] = [];
    for (let offset = 0; offset < total; offset += CHUNK_SECONDS) {
      const chunkPath = join(workDir, `chunk-${offset}.mp3`);
      await sliceAudio(audioPath, chunkPath, offset, CHUNK_SECONDS);
      cues.push(...(await transcribeFile(chunkPath, offset)));
    }
    return cues;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
