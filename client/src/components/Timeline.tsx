import { useMemo, useRef, useEffect } from "react";
import { formatTime } from "../format";
import type { Chapter } from "../api";

interface Props {
  chapters: Chapter[];
  durationSec: number;
  currentSec: number;
  onSeek: (seconds: number) => void;
}

export default function Timeline({
  chapters,
  durationSec,
  currentSec,
  onSeek,
}: Props) {
  const stripRef = useRef<HTMLDivElement>(null);
  const activeChipRef = useRef<HTMLButtonElement>(null);

  const spans = useMemo(
    () =>
      chapters.map((chapter, i) => ({
        ...chapter,
        endSec: chapters[i + 1]?.startSec ?? durationSec,
      })),
    [chapters, durationSec],
  );

  const activeIdx = spans.findIndex(
    (s) => currentSec >= s.startSec && currentSec < s.endSec,
  );

  useEffect(() => {
    activeChipRef.current?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: "smooth",
    });
  }, [activeIdx]);

  if (spans.length === 0 || durationSec <= 0) return null;

  const playheadPct = Math.min(100, (currentSec / durationSec) * 100);

  return (
    <div className="timeline">
      <div className="timeline-bar">
        {spans.map((span, i) => (
          <button
            key={span.startSec}
            className={`timeline-span ${i === activeIdx ? "is-active" : ""}`}
            style={{
              flexGrow: Math.max(span.endSec - span.startSec, 1),
            }}
            onClick={() => onSeek(span.startSec)}
            title={`${formatTime(span.startSec)} — ${span.title}`}
            aria-label={`Jump to ${span.title}`}
          />
        ))}
        <span className="playhead" style={{ left: `${playheadPct}%` }} />
      </div>

      <div className="timeline-chips" ref={stripRef}>
        {spans.map((span, i) => (
          <button
            key={span.startSec}
            ref={i === activeIdx ? activeChipRef : undefined}
            className={`chapter-chip ${i === activeIdx ? "is-active" : ""}`}
            onClick={() => onSeek(span.startSec)}
          >
            <span className="chapter-time mono">
              {formatTime(span.startSec)}
            </span>
            {span.title}
          </button>
        ))}
      </div>
    </div>
  );
}
