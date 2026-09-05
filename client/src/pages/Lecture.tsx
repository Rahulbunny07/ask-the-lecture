import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import Player, { type PlayerHandle } from "../components/Player";
import TranscriptPane from "../components/TranscriptPane";
import Timeline from "../components/Timeline";
import AskPanel from "../components/AskPanel";
import { getLecture, type LectureDetail } from "../api";
import { formatTime } from "../format";

export default function Lecture() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const ingestWarning =
    (location.state as { warning?: string | null } | null)?.warning ?? null;
  const [warningShown, setWarningShown] = useState(true);
  const [lecture, setLecture] = useState<LectureDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentSec, setCurrentSec] = useState(0);
  const playerRef = useRef<PlayerHandle>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    getLecture(id)
      .then((data) => {
        if (!cancelled) setLecture(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load lecture");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <main className="centered">
        <p className="alert">{error}</p>
        <Link to="/">Start over</Link>
      </main>
    );
  }

  if (!lecture) {
    return (
      <main className="centered">
        <p className="muted">Loading lecture…</p>
      </main>
    );
  }

  return (
    <div className="workspace">
      <header className="topbar">
        <Link to="/" className="brand">
          Ask the Lecture
        </Link>
        <h1>{lecture.title}</h1>
        <span className="chip">{formatTime(currentSec)}</span>
      </header>

      {ingestWarning && warningShown && (
        <div className="banner">
          <span>{ingestWarning}</span>
          <button className="btn-mini" onClick={() => setWarningShown(false)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="workspace-body">
        <section className="stage">
          <Player
            ref={playerRef}
            videoId={lecture.videoId || undefined}
            mediaUrl={lecture.mediaUrl || undefined}
            onTime={setCurrentSec}
          />
          <Timeline
            chapters={lecture.chapters ?? []}
            durationSec={lecture.durationSec}
            currentSec={currentSec}
            onSeek={(seconds) => playerRef.current?.seekTo(seconds)}
          />
          <TranscriptPane
            segments={lecture.segments}
            notesText={lecture.notesText}
            currentSec={currentSec}
            onSeek={(seconds) => playerRef.current?.seekTo(seconds)}
          />
        </section>

        <aside className="panel">
          <AskPanel
            lectureId={lecture.id}
            currentSec={currentSec}
            onSeek={(seconds) => playerRef.current?.seekTo(seconds)}
          />
        </aside>
      </div>
    </div>
  );
}
