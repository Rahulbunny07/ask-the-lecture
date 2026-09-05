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
      const message = err instanceof Error ? err.message : "Something broke";
      setError(message);
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
      <p className="eyebrow">02 · Ask the Lecture</p>
      <h1>
        Ask your lecture
        <br />
        anything.
      </h1>
      <p className="lede">
        Paste one lecture. Get a study partner that answers from what your
        teacher actually said — and shows you the second they said it.
      </p>

      <form onSubmit={onSubmit} className="setup-form">
        <label className="field">
          <span>Lecture video</span>
          <input
            type="text"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            autoFocus
            required
          />
        </label>

        <label className="field">
          <span>
            Lecture notes <em>optional</em>
          </span>
          <textarea
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            placeholder="Paste the notes your teacher shared, if you have them."
            rows={4}
          />
        </label>

        {showTranscript && (
          <label className="field">
            <span>
              Transcript <em>captions unavailable — paste it here</em>
            </span>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder={"[00:12] Welcome back everyone...\n[01:04] So last week we covered..."}
              rows={6}
            />
          </label>
        )}

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={busy || !videoUrl.trim()}>
          {busy ? "Reading the lecture…" : "Open lecture"}
        </button>
      </form>
    </main>
  );
}
