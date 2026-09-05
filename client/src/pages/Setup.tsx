import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, createLecture } from "../api";

export default function Setup() {
  const navigate = useNavigate();
  const [videoUrl, setVideoUrl] = useState("");
  const [notesText, setNotesText] = useState("");
  const [transcript, setTranscript] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      const lecture = await createLecture({
        videoUrl,
        notesText: notesText.trim() || undefined,
        transcript: transcript.trim() || undefined,
      });
      navigate(`/l/${lecture.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something broke");
      // Captions failed - reveal the paste-a-transcript escape hatch.
      if (err instanceof ApiError && err.needsTranscript) {
        setShowTranscript(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="setup">
      <div className="setup-inner">
        <header className="setup-head">
          <span className="brand">Ask the Lecture</span>
          <h1>
            Ask your lecture
            <br />
            <span className="accent">anything.</span>
          </h1>
          <p>
            Answers grounded in what your teacher actually said, with the exact
            second they said it. Nothing invented from the internet.
          </p>
        </header>

        <form onSubmit={onSubmit} className="card">
          <div className="field">
            <label className="field-label" htmlFor="videoUrl">
              Lecture recording
            </label>
            <input
              id="videoUrl"
              type="text"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              autoFocus
              required
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="notes">
              Lecture notes <em>optional</em>
            </label>
            <textarea
              id="notes"
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              placeholder="Paste the notes your teacher shared, if you have them."
              rows={3}
            />
          </div>

          {showTranscript && (
            <div className="field">
              <label className="field-label" htmlFor="transcript">
                Transcript <em>captions unavailable, paste it here</em>
              </label>
              <textarea
                id="transcript"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder={
                  "[00:12] Welcome back everyone...\n[01:04] So last week we covered..."
                }
                rows={6}
              />
            </div>
          )}

          {error && <p className="alert">{error}</p>}

          <div className="card-foot">
            <button
              type="submit"
              className="btn-primary"
              disabled={busy || !videoUrl.trim()}
            >
              {busy ? "Reading the lecture…" : "Open lecture"}
            </button>
            <span className="hint">
              Around twenty seconds: we read the captions and map the chapters.
            </span>
          </div>
        </form>
      </div>
    </main>
  );
}
