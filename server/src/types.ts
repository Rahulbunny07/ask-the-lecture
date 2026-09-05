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
  /** YouTube id, or "" when the source is a direct media file. */
  videoId: string;
  /** Direct media URL, or "" for YouTube. */
  mediaUrl: string;
  source: "youtube" | "file";
  durationSec: number;
  notesText: string;
  chapters: Chapter[];
  createdAt: string;
}

export type NewLecture = Omit<Lecture, "id" | "createdAt">;
