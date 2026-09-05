import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Player, { type PlayerHandle } from "../components/Player";
import TranscriptPane from "../components/TranscriptPane";
import AskPanel from "../components/AskPanel";
import { getLecture, type LectureDetail } from "../api";
import { formatTime } from "../format";

export default function Lecture() {
  const { id } = useParams<{ id: string }>();
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

      <div className="workspace-body">
        <section className="stage">
          <Player
            ref={playerRef}
            videoId={lecture.videoId}
            onTime={setCurrentSec}
          />
          <TranscriptPane
            segments={lecture.segments}
            notesText={lecture.notesText}
            currentSec={currentSec}
            onSeek={(seconds) => playerRef.current?.seekTo(seconds)}
          />
        </section>

        <aside className="panel">
          <AskPanel lectureId={lecture.id} currentSec={currentSec} />
        </aside>
      </div>
    </div>
  );
}
