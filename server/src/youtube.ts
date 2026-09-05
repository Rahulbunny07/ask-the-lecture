import { YoutubeTranscript } from "youtube-transcript";

export interface Cue {
  startSec: number;
  durSec: number;
  text: string;
}

const ID = /^[\w-]{11}$/;

export function parseVideoId(input: string): string | null {
  const raw = input.trim();
  if (ID.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.slice(1);
    return ID.test(id) ? id : null;
  }
  if (host.endsWith("youtube.com")) {
    const v = url.searchParams.get("v");
    if (v && ID.test(v)) return v;
    const parts = url.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && ID.test(last)) return last;
  }
  return null;
}

/** oEmbed gives us a title without an API key. */
export async function fetchTitle(videoId: string): Promise<string> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
    );
    if (!res.ok) return "Untitled lecture";
    const data = (await res.json()) as { title?: string };
    return data.title?.trim() || "Untitled lecture";
  } catch {
    return "Untitled lecture";
  }
}

/**
 * youtube-transcript has shipped offsets in both seconds and milliseconds.
 * Sniff the scale off the largest offset rather than pinning a version.
 */
function scaleOf(values: number[]): number {
  const max = values.reduce((a, b) => Math.max(a, b), 0);
  return max > 86_400 ? 1000 : 1;
}

/**
 * YouTube often carries auto-translated tracks alongside the original. Without
 * an explicit language the scraper picks one arbitrarily - we saw the same
 * video come back in English once and Arabic the next call - so pin it and
 * only fall back to the default track if the preferred one is missing.
 */
export async function fetchCaptions(
  videoId: string,
  lang = "en",
): Promise<Cue[]> {
  let raw: Awaited<ReturnType<typeof YoutubeTranscript.fetchTranscript>>;
  try {
    raw = await YoutubeTranscript.fetchTranscript(videoId, { lang });
  } catch {
    raw = await YoutubeTranscript.fetchTranscript(videoId);
  }
  if (!raw || raw.length === 0) return [];

  const scale = scaleOf(raw.map((c) => Number(c.offset) || 0));
  return raw.map((c) => ({
    startSec: (Number(c.offset) || 0) / scale,
    durSec: (Number(c.duration) || 0) / scale,
    text: String(c.text ?? "")
      .replace(/\s+/g, " ")
      .trim(),
  }));
}
