/**
 * Common words that settle it immediately. If any of these appear, the input
 * is someone typing, however tersely, and must never be rejected.
 */
const REAL_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "do", "does", "did", "can",
  "could", "should", "would", "will", "what", "why", "how", "when", "where",
  "who", "which", "explain", "define", "mean", "means", "meaning", "about",
  "tell", "say", "said", "show", "give", "in", "on", "of", "for", "to", "and",
  "or", "not", "this", "that", "it", "he", "she", "they", "i", "you", "we",
  "lecture", "again", "more", "simpler", "example", "summary", "difference",
]);

function longestRun(letters: string, pattern: RegExp): number {
  let best = 0;
  let current = 0;
  for (const character of letters) {
    if (pattern.test(character)) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

function caseSwitches(token: string): number {
  let switches = 0;
  for (let i = 1; i < token.length; i++) {
    const previous = token[i - 1] as string;
    const current = token[i] as string;
    if (!/[a-z]/i.test(previous) || !/[a-z]/i.test(current)) continue;
    const wasUpper = previous === previous.toUpperCase();
    const isUpper = current === current.toUpperCase();
    if (wasUpper !== isUpper) switches += 1;
  }
  return switches;
}

const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

/**
 * No English word contains five consecutive keys from one keyboard row, so
 * this catches row-mashing that happens to carry enough vowels to look real.
 */
function containsKeyboardRun(token: string): boolean {
  const lowered = token.toLowerCase();
  for (const row of KEYBOARD_ROWS) {
    for (let i = 0; i + 5 <= row.length; i++) {
      if (lowered.includes(row.slice(i, i + 5))) return true;
    }
  }
  return false;
}

/** A single token that reads like a hand dragged across the keyboard. */
function tokenIsMashed(token: string): boolean {
  const letters = token.replace(/[^a-z]/gi, "");
  if (letters.length < 10) return false;

  if (containsKeyboardRun(letters)) return true;

  const vowels = (letters.match(/[aeiou]/gi) ?? []).length;
  const vowelRatio = vowels / letters.length;

  return (
    vowelRatio < 0.22 ||
    caseSwitches(letters) >= 5 ||
    longestRun(letters.toLowerCase(), /[bcdfghjklmnpqrstvwxz]/) >= 6
  );
}

/**
 * Is this input unreadable enough that asking the model is a waste of a call?
 *
 * Deliberately narrow. A short question is still a question, so the checks
 * only fire on long unbroken tokens with no word-like structure - the cost of
 * rejecting a real question is far worse than the cost of answering a stray
 * keystroke.
 */
export function looksUnreadable(input: string): boolean {
  const text = input.trim();
  if (!text) return true;
  if (text.includes("?")) return false;

  const tokens = text.split(/\s+/);
  if (tokens.length > 3) return false;

  const lowered = tokens.map((t) => t.replace(/[^a-z]/gi, "").toLowerCase());
  if (lowered.some((t) => REAL_WORDS.has(t))) return false;

  return tokens.some(tokenIsMashed);
}

export const UNREADABLE_REPLY =
  "I couldn't read that as a question. Ask me anything about this lecture, or click a chapter to see what it covers.";
