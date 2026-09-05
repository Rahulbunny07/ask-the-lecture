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

export type LectureStatus = "processing" | "ready" | "failed";

export interface Lecture {
  id: string;
  title: string;
  /** YouTube id, or "" when the source is a direct media file. */
  videoId: string;
  /** Direct media URL, or "" for YouTube. */
  mediaUrl: string;
  source: "youtube" | "file";
  durationSec: number;
  notesText: string;
  chapters: Chapter[];
  status: LectureStatus;
  /** Human-readable description of what is happening right now. */
  stage: string;
  error: string | null;
  createdAt: string;
}

export type NewLecture = Omit<Lecture, "id" | "createdAt">;
