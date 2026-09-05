import { useEffect, useState } from "react";

interface Props {
  title?: string | undefined;
  /** What the server says it is doing right now. */
  stage: string;
}

/**
 * The ordered work an ingest goes through. The server sends the live stage as
 * free text, so these are matched loosely - a step is done once a later one
 * has been reported.
 */
const STEPS = [
  { key: "get", label: "Fetching the lecture" },
  { key: "audio", label: "Extracting the audio" },
  { key: "transcribe", label: "Transcribing the speech" },
  { key: "chapters", label: "Mapping the chapters" },
];

function stepIndexFor(stage: string): number {
  const s = stage.toLowerCase();
  if (s.includes("chapter")) return 3;
  if (s.includes("transcrib") || s.includes("your transcript")) return 2;
  if (s.includes("audio") || s.includes("caption")) return 1;
  return 0;
}

export default function Preparing({ title, stage }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);

  const active = stepIndexFor(stage);

  return (
    <main className="preparing">
      <div className="preparing-card">
        <span className="brand">Ask the Lecture</span>

        <div>
          <h2 className="preparing-title">
            {title ? title : "Preparing your lecture"}
          </h2>
          <p className="preparing-sub">
            {stage || "Getting started"}
            {elapsed > 0 && <span className="mono"> · {elapsed}s</span>}
          </p>
        </div>

        <ol className="steps">
          {STEPS.map((step, i) => (
            <li
              key={step.key}
              className={
                i < active ? "step is-done" : i === active ? "step is-active" : "step"
              }
            >
              <span className="step-dot" />
              {step.label}
            </li>
          ))}
        </ol>

        <div className="progress-track">
          <span className="progress-fill" />
        </div>

        <p className="hint">
          A long recording takes a couple of minutes. You can leave this page
          open — the work carries on either way.
        </p>
      </div>
    </main>
  );
}
