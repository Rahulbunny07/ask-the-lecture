import { Schema, model } from "mongoose";

const lectureSchema = new Schema({
  title: { type: String, required: true },
  videoId: { type: String, required: true },
  source: { type: String, enum: ["youtube", "paste"], default: "youtube" },
  durationSec: { type: Number, default: 0 },
  notesText: { type: String, default: "" },
  chapters: {
    type: [{ startSec: Number, title: String, _id: false }],
    default: [],
  },
  createdAt: { type: Date, default: Date.now },
});

const segmentSchema = new Schema({
  lectureId: { type: Schema.Types.ObjectId, required: true, index: true },
  idx: { type: Number, required: true },
  startSec: { type: Number, required: true },
  endSec: { type: Number, required: true },
  text: { type: String, required: true },
});

segmentSchema.index({ lectureId: 1, idx: 1 });

export const LectureModel = model("Lecture", lectureSchema);
export const SegmentModel = model("Segment", segmentSchema);
