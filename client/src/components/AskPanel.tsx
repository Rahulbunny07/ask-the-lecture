import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { askLecture, type AskMode } from "../api";
import { formatTime } from "../format";
import AnswerText from "./AnswerText";

interface Message {
  role: "user" | "assistant";
  text: string;
  /** On an assistant turn, the question that produced it, so it can be re-asked. */
  question?: string;
}

/**
 * The system prompt pins the exact opening sentence for an uncovered
 * question, which lets the answer be labelled rather than read closely.
 */
const NOT_COVERED = "This lecture doesn't cover that";

function isNotCovered(text: string): boolean {
  return text.trimStart().startsWith(NOT_COVERED);
}

interface Props {
  lectureId: string;
  currentSec: number;
  onSeek: (seconds: number) => void;
}

export default function AskPanel({ lectureId, currentSec, onSeek }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({
      top: bodyRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function run(display: string, question: string, mode: AskMode) {
    const trimmed = question.trim();
    if (!trimmed || busy) return;

    setDraft("");
    setError(null);
    setBusy(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", text: display },
      { role: "assistant", text: "", question: trimmed },
    ]);

    try {
      await askLecture(lectureId, trimmed, (delta) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant") {
            next[next.length - 1] = { ...last, text: last.text + delta };
          }
          return next;
        });
      }, mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That question failed");
      // Drop the empty assistant turn so the thread does not show a blank reply.
      setMessages((prev) =>
        prev.filter((m, i) => !(i === prev.length - 1 && m.text === "")),
      );
    } finally {
      setBusy(false);
    }
  }

  function ask(question: string) {
    void run(question, question, "default");
  }

  function explainDifferently(question: string) {
    void run("Explain that differently", question, "simpler");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      ask(draft);
    }
  }

  const suggestions = [
    `What was being explained around ${formatTime(currentSec)}?`,
    "What are the main ideas in this lecture?",
    "What did the lecturer say that I should not miss?",
  ];

  return (
    <>
      <div className="panel-head">
        <span className="panel-title">Ask</span>
        <span className="hint">Grounded in this lecture only</span>
      </div>

      <div className="panel-body" ref={bodyRef}>
        {messages.length === 0 ? (
          <div className="ask-empty">
            <p className="empty-lead">
              Ask anything about this lecture. Every answer comes from the
              recording, with the moment it came from.
            </p>
            <div className="suggestions">
              {suggestions.map((s) => (
                <button
                  key={s}
                  className="suggestion"
                  onClick={() => ask(s)}
                  disabled={busy}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="thread">
            {messages.map((message, i) => (
              <div key={i} className={`msg msg-${message.role}`}>
                {message.role === "assistant" ? (
                  message.text ? (
                    <>
                      {isNotCovered(message.text) && (
                        <span className="badge-warn">Not in this lecture</span>
                      )}
                      <AnswerText text={message.text} onSeek={onSeek} />
                      {!busy && message.question && (
                        <div className="msg-actions">
                          <button
                            className="btn-mini"
                            onClick={() => explainDifferently(message.question as string)}
                          >
                            Explain it differently
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="thinking">Reading the lecture…</span>
                  )
                ) : (
                  message.text
                )}
              </div>
            ))}
          </div>
        )}

        {error && <p className="alert">{error}</p>}
      </div>

      <div className="composer">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask about this lecture…"
          rows={2}
          disabled={busy}
        />
        <button
          className="btn-primary send"
          onClick={() => ask(draft)}
          disabled={busy || !draft.trim()}
        >
          {busy ? "…" : "Ask"}
        </button>
      </div>
    </>
  );
}
