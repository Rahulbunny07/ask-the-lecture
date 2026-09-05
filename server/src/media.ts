const MEDIA_EXTENSIONS = /\.(mp4|m4v|webm|mov|ogv|mp3|m4a|wav)(\?.*)?$/i;

/**
 * Anything that is not a YouTube link but looks like a playable file. Course
 * platforms typically serve lectures straight off a CDN, so this is the
 * common case outside YouTube.
 */
export function looksLikeMediaUrl(input: string): boolean {
  const raw = input.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return MEDIA_EXTENSIONS.test(url.pathname) || MEDIA_EXTENSIONS.test(raw);
}

export interface MediaProbe {
  ok: boolean;
  status: number;
  contentType: string;
  bytes: number | null;
  /**
   * Without byte-range support a browser cannot seek, which would silently
   * break every citation - the failure is invisible, so it gets detected here.
   */
  supportsRanges: boolean;
}

function describe(
  res: Response,
  bytesHeader: string | null,
  supportsRanges: boolean,
): MediaProbe {
  return {
    ok: res.ok,
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
    bytes: bytesHeader ? Number(bytesHeader) : null,
    supportsRanges,
  };
}

/**
 * Is the file reachable from the server, and how big is it?
 *
 * Plenty of CDNs refuse HEAD outright, so a failed HEAD is not evidence the
 * file is missing - fall back to asking for a single byte, which is cheap and
 * far more widely allowed.
 */
export async function probeMedia(url: string): Promise<MediaProbe> {
  try {
    const head = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (head.ok) {
      return describe(
        head,
        head.headers.get("content-length"),
        (head.headers.get("accept-ranges") ?? "").includes("bytes"),
      );
    }
  } catch {
    // fall through to the ranged GET
  }

  try {
    const ranged = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { Range: "bytes=0-0" },
    });
    // Content-Range carries the true size; Content-Length is just the 1 byte.
    const total = ranged.headers.get("content-range")?.split("/").pop() ?? null;
    await ranged.body?.cancel();
    // A 206, or an explicit Accept-Ranges, is the only proof seeking will work.
    const supportsRanges =
      ranged.status === 206 ||
      (ranged.headers.get("accept-ranges") ?? "").includes("bytes");
    return describe(ranged, total && total !== "*" ? total : null, supportsRanges);
  } catch {
    return {
      ok: false,
      status: 0,
      contentType: "",
      bytes: null,
      supportsRanges: false,
    };
  }
}

/** Last path segment, cleaned up enough to use as a lecture title. */
export function titleFromUrl(url: string): string {
  try {
    const name = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    const stem = decodeURIComponent(name).replace(MEDIA_EXTENSIONS, "");
    const cleaned = stem.replace(/[_-]+/g, " ").trim();
    return cleaned || "Untitled lecture";
  } catch {
    return "Untitled lecture";
  }
}
