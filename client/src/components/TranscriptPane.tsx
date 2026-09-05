import { useEffect, useRef, useState } from "react";
import { formatTime } from "../format";
import type { Segment } from "../api";

type Tab = "transcript" | "notes";

interface Props {
  segments: Segment[];
  notesText: string;
  currentSec: number;
  onSeek: (seconds: number) => void;
}

export default function TranscriptPane({
  segments,
  notesText,
  currentSec,
  onSeek,
}: Props) {
  const [tab, setTab] = useState<Tab>("transcript");
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Merged caption windows can overlap by a second, so match on the last
  // segment that has started rather than on a containing range.
  let activeIdx = -1;
  for (let i = 0; i < segments.length; i++) {
    if ((segments[i] as Segment).startSec <= currentSec) activeIdx = i;
    else break;
  }

  // Follow playback, but only while the transcript tab is the one on screen.
  useEffect(() => {
    if (tab !== "transcript") return;
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIdx, tab]);

  return (
    <div className="reader">
      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "transcript"}
          className={`tab ${tab === "transcript" ? "is-active" : ""}`}
          onClick={() => setTab("transcript")}
        >
          Transcript
        </button>
        <button
          role="tab"
          aria-selected={tab === "notes"}
          className={`tab ${tab === "notes" ? "is-active" : ""}`}
          onClick={() => setTab("notes")}
        >
          Notes
        </button>
        <span className="tabs-meta mono">
          {tab === "transcript" ? `${segments.length} segments` : ""}
        </span>
      </div>

      {tab === "transcript" ? (
        <div className="reader-body" ref={listRef}>
          {segments.map((segment, i) => (
            <button
              key={segment.idx}
              ref={i === activeIdx ? activeRef : undefined}
              className={`seg ${i === activeIdx ? "is-active" : ""}`}
              onClick={() => onSeek(segment.startSec)}
              title="Jump to this moment"
            >
              <span className="seg-time mono">
                {formatTime(segment.startSec)}
              </span>
              <span className="seg-text">{segment.text}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="reader-body">
          {notesText.trim() ? (
            <p className="notes">{notesText}</p>
          ) : (
            <p className="empty">
              No notes attached to this lecture. You can paste them in when you
              open a lecture.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
