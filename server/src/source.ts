import { parseVideoId } from "./youtube.js";

export type Resolved =
  | { kind: "youtube"; videoId: string; provider: string }
  | { kind: "file"; mediaUrl: string; provider: string }
  | { kind: "unusable"; reason: string };

const DRIVE_ID = [
  /\/file\/d\/([\w-]{10,})/,
  /[?&]id=([\w-]{10,})/,
  /\/d\/([\w-]{10,})/,
];

function driveFileId(url: URL): string | null {
  const href = url.href;
  for (const pattern of DRIVE_ID) {
    const match = pattern.exec(href);
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * Turns whatever someone pastes into something we can actually play.
 *
 * Share links are pages, not media, so the common hosts each need their own
 * rewrite to the underlying file. Anything else is passed through and judged
 * by what the server sees when it fetches it, rather than by its extension -
 * plenty of CDNs serve video from an extensionless path.
 */
export function resolveSource(input: string): Resolved {
  const raw = input.trim();
  if (!raw) return { kind: "unusable", reason: "No link given." };

  const videoId = parseVideoId(raw);
  if (videoId) return { kind: "youtube", videoId, provider: "YouTube" };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {
      kind: "unusable",
      reason: "That is not a link. Paste the full URL, including https://",
    };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { kind: "unusable", reason: "Only http and https links work here." };
  }

  const host = url.hostname.replace(/^www\./, "");

  // Google Drive: a /view link is a page, the file itself lives behind uc.
  if (host === "drive.google.com" || host === "docs.google.com") {
    const id = driveFileId(url);
    if (!id) {
      return {
        kind: "unusable",
        reason: "Could not find a file id in that Google Drive link.",
      };
    }
    return {
      kind: "file",
      mediaUrl: `https://drive.google.com/uc?export=download&id=${id}`,
      provider: "Google Drive",
    };
  }

  // Dropbox serves a preview page unless asked for the raw file.
  if (host === "dropbox.com" || host.endsWith(".dropbox.com")) {
    url.searchParams.delete("dl");
    url.searchParams.set("raw", "1");
    return { kind: "file", mediaUrl: url.toString(), provider: "Dropbox" };
  }

  // OneDrive and SharePoint share links need an explicit download flag.
  if (host === "1drv.ms" || host.endsWith("sharepoint.com") || host === "onedrive.live.com") {
    url.searchParams.set("download", "1");
    return { kind: "file", mediaUrl: url.toString(), provider: "OneDrive" };
  }

  return { kind: "file", mediaUrl: url.toString(), provider: host };
}

const MEDIA_EXTENSIONS = /\.(mp4|m4v|webm|mov|ogv|mkv|mp3|m4a|wav|aac|flac)(\?.*)?$/i;

/**
 * Content type is the real evidence; the extension is only a fallback for
 * hosts that send something unhelpful like application/octet-stream.
 */
export function looksPlayable(contentType: string, mediaUrl: string): boolean {
  const type = contentType.toLowerCase();
  if (type.startsWith("video/") || type.startsWith("audio/")) return true;
  if (type.startsWith("application/octet-stream")) {
    return MEDIA_EXTENSIONS.test(mediaUrl);
  }
  return MEDIA_EXTENSIONS.test(mediaUrl);
}

/** A share page came back instead of a file - almost always a permission problem. */
export function isSharePage(contentType: string): boolean {
  return contentType.toLowerCase().includes("text/html");
}
