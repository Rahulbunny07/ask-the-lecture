import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import Player, { type PlayerHandle } from "../components/Player";
import TranscriptPane from "../components/TranscriptPane";
import Timeline from "../components/Timeline";
import AskPanel from "../components/AskPanel";
import Preparing from "../components/Preparing";
import { getLecture, type LectureDetail } from "../api";
import { formatTime } from "../format";

const POLL_MS = 1500;

export default function Lecture() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const ingestWarning =
    (location.state as { warning?: string | null } | null)?.warning ?? null;

  const [lecture, setLecture] = useState<LectureDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warningShown, setWarningShown] = useState(true);
  const [currentSec, setCurrentSec] = useState(0);
  const playerRef = useRef<PlayerHandle>(null);

  // Ingest runs server-side, so poll until it settles one way or the other.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      try {
        const data = await getLecture(id as string);
        if (cancelled) return;
        setLecture(data);
        if (data.status === "processing") {
          timer = setTimeout(tick, POLL_MS);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load lecture");
      }
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  if (error) {
    return (
      <main className="centered">
        <p className="alert">{error}</p>
        <Link to="/" className="btn-mini">
          Start over
        </Link>
      </main>
    );
  }

  if (!lecture || lecture.status === "processing") {
    return <Preparing title={lecture?.title} stage={lecture?.stage ?? ""} />;
  }

  if (lecture.status === "failed") {
    return (
      <main className="centered">
        <div className="failed-card">
          <span className="badge-warn">Could not prepare this lecture</span>
          <p className="failed-reason">
            {lecture.error ?? "Something went wrong while reading the lecture."}
          </p>
          <button
            className="btn-primary"
            onClick={() =>
              navigate("/", {
                state: {
                  videoUrl: lecture.mediaUrl || undefined,
                  needsTranscript: true,
                },
              })
            }
          >
            Try again with a transcript
          </button>
        </div>
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
