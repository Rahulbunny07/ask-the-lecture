import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Player, { type PlayerHandle } from "../components/Player";
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
        <p className="error">{error}</p>
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
        <Link to="/" className="mark">
          Ask the Lecture
        </Link>
        <h1>{lecture.title}</h1>
        <span className="muted">{formatTime(currentSec)}</span>
      </header>

      <div className="workspace-body">
        <section className="stage">
          <Player
            ref={playerRef}
            videoId={lecture.videoId}
            onTime={setCurrentSec}
          />
        </section>

        <aside className="panel">
          <p className="muted">Ask panel goes here.</p>
        </aside>
      </div>
    </div>
  );
}
