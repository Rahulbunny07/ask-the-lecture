import Anthropic from "@anthropic-ai/sdk";
import type { Lecture, Segment } from "./types.js";

let client: Anthropic | null = null;

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient(): Anthropic {
  // The SDK reads ANTHROPIC_API_KEY from the environment itself.
  if (!client) client = new Anthropic();
  return client;
}

const MODEL = "claude-opus-5";

const RULES = `You are a study partner for ONE specific lecture. Below you have that lecture's full timestamped transcript, and the student's notes if they attached any.

Rules, in order of importance:

1. Answer only from the transcript and notes given to you. Never fall back on outside knowledge, even when you are confident it is correct and the lecturer was simplifying or wrong. The student is examined on THIS lecture, by the person who taught it.

2. If the transcript does not cover the question, say so plainly. Your reply must then begin with this exact sentence, character for character: "This lecture doesn't cover that." Then, if the lecturer said something adjacent, offer that in one sentence with its citation, and where useful say where the lecture's coverage of the topic actually stops. Never quietly answer from general knowledge instead - a student needs to know where their syllabus ends.

   If the lecture covers part of the question but not all of it, answer the covered part normally and then state plainly which part it does not cover. Do not fill the gap yourself.

3. Cite every claim. Write citations as U+27E6 SECONDS U+27E7 - that is the exact character pair - where SECONDS is the integer start second of the transcript line you used, placed immediately after the sentence it supports. Use several citations when an answer draws on several moments.

4. Use the lecturer's own notation, symbols, terminology and conventions, not the textbook's. If they call it theta, call it theta.

5. Be concise. A few sentences, not an essay. This is revision, not a textbook.`;

function renderTranscript(lecture: Lecture, segments: Segment[]): string {
  const lines = segments
    .map((s) => `[t=${s.startSec}] ${s.text}`)
    .join("\n");

  const notes = lecture.notesText.trim()
    ? `\n\nSTUDENT'S NOTES FOR THIS LECTURE\n${lecture.notesText.trim()}`
    : "";

  return `LECTURE: ${lecture.title}\n\nTRANSCRIPT\n${lines}${notes}`;
}

export interface AskInput {
  lecture: Lecture;
  segments: Segment[];
  question: string;
}

/**
 * A single lecture is ~15k tokens, which fits in context many times over, so
 * the whole transcript goes in every request rather than being retrieved.
 * That removes retrieval misses entirely and makes a refusal mean "not in the
 * lecture" instead of "the search missed it". Caching keeps it cheap.
 */
export async function* askStream({
  lecture,
  segments,
  question,
}: AskInput): AsyncGenerator<string> {
  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: [
      { type: "text", text: RULES },
      {
        type: "text",
        text: renderTranscript(lecture, segments),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: question }],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}
