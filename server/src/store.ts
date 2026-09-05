import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { mongoReady } from "./db.js";
import { LectureModel, SegmentModel } from "./models.js";
import type { Lecture, NewLecture, Segment } from "./types.js";

export interface LectureStore {
  createLecture(input: NewLecture, segments: Segment[]): Promise<Lecture>;
  getLecture(id: string): Promise<Lecture | null>;
  getSegments(id: string): Promise<Segment[]>;
  /** Ingest runs in the background, so a lecture is updated after creation. */
  updateLecture(id: string, patch: Partial<NewLecture>): Promise<void>;
  setSegments(id: string, segments: Segment[]): Promise<void>;
}

const mongoStore: LectureStore = {
  async createLecture(input, segments) {
    const doc = await LectureModel.create(input);
    if (segments.length > 0) {
      await SegmentModel.insertMany(
        segments.map((s) => ({ ...s, lectureId: doc._id })),
      );
    }
    return {
      id: doc._id.toString(),
      title: doc.title,
      videoId: doc.videoId ?? "",
      mediaUrl: doc.mediaUrl ?? "",
      source: doc.source as Lecture["source"],
      durationSec: doc.durationSec ?? 0,
      notesText: doc.notesText ?? "",
      chapters: (doc.chapters ?? []).map((c) => ({
        startSec: c.startSec ?? 0,
        title: c.title ?? "",
      })),
      status: (doc.status ?? "ready") as Lecture["status"],
      stage: doc.stage ?? "",
      error: doc.error ?? null,
      createdAt: (doc.createdAt ?? new Date()).toISOString(),
    };
  },

  async getLecture(id) {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await LectureModel.findById(id);
    if (!doc) return null;
    return {
      id: doc._id.toString(),
      title: doc.title,
      videoId: doc.videoId ?? "",
      mediaUrl: doc.mediaUrl ?? "",
      source: doc.source as Lecture["source"],
      durationSec: doc.durationSec ?? 0,
      notesText: doc.notesText ?? "",
      chapters: (doc.chapters ?? []).map((c) => ({
        startSec: c.startSec ?? 0,
        title: c.title ?? "",
      })),
      status: (doc.status ?? "ready") as Lecture["status"],
      stage: doc.stage ?? "",
      error: doc.error ?? null,
      createdAt: (doc.createdAt ?? new Date()).toISOString(),
    };
  },

  async getSegments(id) {
    if (!Types.ObjectId.isValid(id)) return [];
    const docs = await SegmentModel.find({ lectureId: id }).sort({ idx: 1 });
    return docs.map((d) => ({
      idx: d.idx,
      startSec: d.startSec,
      endSec: d.endSec,
      text: d.text,
    }));
  },

  async updateLecture(id, patch) {
    if (!Types.ObjectId.isValid(id)) return;
    await LectureModel.updateOne({ _id: id }, { $set: patch });
  },

  async setSegments(id, segments) {
    if (!Types.ObjectId.isValid(id)) return;
    await SegmentModel.deleteMany({ lectureId: id });
    if (segments.length > 0) {
      await SegmentModel.insertMany(
        segments.map((s) => ({ ...s, lectureId: new Types.ObjectId(id) })),
      );
    }
  },
};

/** Keeps the server usable before Atlas is wired up. Lost on restart. */
function createMemoryStore(): LectureStore {
  const lectures = new Map<string, Lecture>();
  const segments = new Map<string, Segment[]>();

  return {
    async createLecture(input, incoming) {
      const id = randomUUID();
      const lecture: Lecture = {
        ...input,
        id,
        createdAt: new Date().toISOString(),
      };
      lectures.set(id, lecture);
      segments.set(id, incoming);
      return lecture;
    },
    async getLecture(id) {
      return lectures.get(id) ?? null;
    },
    async getSegments(id) {
      return segments.get(id) ?? [];
    },
    async updateLecture(id, patch) {
      const current = lectures.get(id);
      if (current) lectures.set(id, { ...current, ...patch });
    },
    async setSegments(id, incoming) {
      segments.set(id, incoming);
    },
  };
}

const memoryStore = createMemoryStore();

export function getStore(): LectureStore {
  return mongoReady() ? mongoStore : memoryStore;
}

export function storeKind(): "mongodb" | "in-memory" {
  return mongoReady() ? "mongodb" : "in-memory";
}
