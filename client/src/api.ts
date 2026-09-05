export interface Segment {
  idx: number;
  startSec: number;
  endSec: number;
  text: string;
}

export interface Chapter {
  startSec: number;
  title: string;
}

export interface Lecture {
  id: string;
  title: string;
  videoId: string;
  mediaUrl: string;
  source: "youtube" | "file";
  durationSec: number;
  notesText: string;
  chapters: Chapter[];
  createdAt: string;
}

export interface LectureDetail extends Lecture {
  segments: Segment[];
}

export interface CreateLectureInput {
  videoUrl: string;
  notesText?: string;
  transcript?: string;
}

/** Empty in dev (Vite proxies /api); set VITE_API_BASE for deployed builds. */
const BASE = import.meta.env.VITE_API_BASE ?? "";

export class ApiError extends Error {
  readonly status: number;
  readonly needsTranscript: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    // 422 is the server telling us captions could not be read.
    this.needsTranscript = status === 422;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      (body as { error?: string } | null)?.error ??
      `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

export function createLecture(
  input: CreateLectureInput,
): Promise<Lecture & { segmentCount: number; warning: string | null }> {
  return request("/api/lectures", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function getLecture(id: string): Promise<LectureDetail> {
  return request(`/api/lectures/${id}`);
}

/**
 * The ask endpoint streams SSE. Deltas arrive as they are generated so the
 * answer appears progressively rather than after a long silence.
 */
export type AskMode = "default" | "simpler";

export async function askLecture(
  id: string,
  question: string,
  onDelta: (text: string) => void,
  mode: AskMode = "default",
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/api/lectures/${id}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, mode }),
    signal,
  });

  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;

      const payload = JSON.parse(line.slice(6)) as
        | { type: "delta"; text: string }
        | { type: "done" }
        | { type: "error"; message: string };

      if (payload.type === "delta") onDelta(payload.text);
      else if (payload.type === "error") throw new Error(payload.message);
    }
  }
}
