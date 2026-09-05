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

export type NewLecture = Omit<Lecture, "id" | "createdAt">;
