import type { Cue } from "./youtube.js";
import type { Segment } from "./types.js";

/**
 * Caption cues are 2-5s each, which is far too granular to cite. Merge them
 * into windows big enough to carry meaning and small enough that a timestamp
 * lands the student on the right sentence.
 */
export function mergeCues(cues: Cue[], targetSec = 45): Segment[] {
  const out: Segment[] = [];
  let buf: Cue[] = [];
  let start = 0;

  const flush = () => {
    if (buf.length === 0) return;
    const last = buf[buf.length - 1]!;
    const text = buf
      .map((c) => c.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) {
      out.push({
        idx: out.length,
        startSec: Math.round(start),
        endSec: Math.round(last.startSec + last.durSec),
        text,
      });
    }
    buf = [];
  };

  for (const cue of cues) {
    if (buf.length === 0) start = cue.startSec;
    buf.push(cue);
    if (cue.startSec + cue.durSec - start >= targetSec) flush();
  }
  flush();
  return out;
}

const STAMP = /^\s*\[?(?:(\d{1,2}):)?(\d{1,3}):(\d{2})\]?\s*(.*)$/;

/**
 * Fallback for when caption scraping fails: accept a pasted transcript,
 * with or without timestamps.
 */
export function parseTranscriptText(input: string): Segment[] {
  const lines = input.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const stamped: Cue[] = [];

  for (const line of lines) {
    const m = STAMP.exec(line);
    if (!m) continue;
    const [, h, mm, ss, text] = m;
    if (!text || !text.trim()) continue;
    const startSec =
      Number(h ?? 0) * 3600 + Number(mm ?? 0) * 60 + Number(ss ?? 0);
    stamped.push({ startSec, durSec: 0, text: text.trim() });
  }

  if (stamped.length > 0) {
    for (let i = 0; i < stamped.length; i++) {
      const cur = stamped[i]!;
      const next = stamped[i + 1];
      cur.durSec = next ? Math.max(next.startSec - cur.startSec, 1) : 30;
    }
    return mergeCues(stamped);
  }

  // No timestamps at all - still usable for notes-style text.
  const words = input.split(/\s+/).filter(Boolean);
  const out: Segment[] = [];
  for (let i = 0; i < words.length; i += 120) {
    out.push({
      idx: out.length,
      startSec: 0,
      endSec: 0,
      text: words.slice(i, i + 120).join(" "),
    });
  }
  return out;
}
