import { Fragment, type ReactNode } from "react";
import { formatTime } from "../format";

/** The model emits citations as U+27E6 seconds U+27E7. */
const CITATION = /⟦(\d+)⟧/g;
const BOLD = /\*\*([^*]+)\*\*/g;
/** A marker still arriving mid-stream, e.g. "⟦43" - hide it until complete. */
const PARTIAL_CITATION = /⟦\d*$/;

interface Props {
  text: string;
  onSeek: (seconds: number) => void;
}

function withBold(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let i = 0;

  for (const match of text.matchAll(BOLD)) {
    const at = match.index ?? 0;
    if (at > cursor) nodes.push(text.slice(cursor, at));
    nodes.push(<strong key={`${keyBase}-b${i++}`}>{match[1]}</strong>);
    cursor = at + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function withCitations(
  text: string,
  onSeek: (seconds: number) => void,
  keyBase: string,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let i = 0;

  for (const match of text.matchAll(CITATION)) {
    const at = match.index ?? 0;
    if (at > cursor) {
      nodes.push(...withBold(text.slice(cursor, at), `${keyBase}-t${i}`));
    }

    const seconds = Number(match[1]);
    nodes.push(
      <button
        key={`${keyBase}-c${i++}`}
        className="cite"
        onClick={() => onSeek(seconds)}
        title={`Jump to ${formatTime(seconds)} in the recording`}
      >
        {formatTime(seconds)}
      </button>,
    );
    cursor = at + match[0].length;
  }

  if (cursor < text.length) {
    nodes.push(...withBold(text.slice(cursor), `${keyBase}-tail`));
  }
  return nodes;
}

/**
 * Deliberately not a full markdown renderer. The model produces short answers
 * with bold, bullets and citations, and a parser that only handles those three
 * cannot mangle anything else.
 */
export default function AnswerText({ text, onSeek }: Props) {
  const cleaned = text.replace(PARTIAL_CITATION, "");
  const lines = cleaned.split("\n");
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="answer-list">
        {items.map((item, i) => (
          <li key={i}>{withCitations(item, onSeek, `li-${blocks.length}-${i}`)}</li>
        ))}
      </ul>,
    );
  };

  lines.forEach((line, i) => {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet?.[1]) {
      bullets.push(bullet[1]);
      return;
    }
    flushBullets();
    if (!line.trim()) return;
    blocks.push(
      <p key={`p-${i}`} className="answer-para">
        {withCitations(line, onSeek, `p-${i}`)}
      </p>,
    );
  });
  flushBullets();

  return <Fragment>{blocks}</Fragment>;
}
