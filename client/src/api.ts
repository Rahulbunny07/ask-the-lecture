export interface Segment {
  idx: number;
  startSec: number;
  endSec: number;
  text: string;
}

export interface Lecture {
  id: string;
  title: string;
  videoId: string;
  source: "youtube" | "paste";
  durationSec: number;
  notesText: string;
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
): Promise<Lecture & { segmentCount: number }> {
  return request("/api/lectures", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function getLecture(id: string): Promise<LectureDetail> {
  return request(`/api/lectures/${id}`);
}
