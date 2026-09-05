import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getLecture, type LectureDetail } from "../api";

export default function Lecture() {
  const { id } = useParams<{ id: string }>();
  const [lecture, setLecture] = useState<LectureDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        <span className="muted">{lecture.segments.length} segments</span>
      </header>
    </div>
  );
}
