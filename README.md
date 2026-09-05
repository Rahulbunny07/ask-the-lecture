# Ask the Lecture

An AI study partner that sits on top of **one** lecture's recording and notes,
answers questions about it, and shows you the exact second the answer came from.

Built for the "I Build It With AI" championship, problem 02.

---

## Why it isn't just ChatGPT with a video

ChatGPT answers from the internet. You are examined on your teacher.

- It answers **only** from this lecture's transcript and notes. Ask something the
  lecturer never covered and it says so, plainly, instead of confidently filling
  the gap from general knowledge.
- Every claim carries a **timestamp you can click**, which jumps the recording to
  that second. The citation is not decoration, it is the trust surface: it turns
  "an AI said so" into "my teacher said so, here, listen".
- It uses the **lecturer's own notation and vocabulary**, because it is reading
  their words and not a textbook.

## What it does

| | |
|---|---|
| **Ask** | Grounded answers, streamed, with clickable timestamp citations |
| **Not covered** | Says plainly when the lecture doesn't cover something, and where its coverage stops |
| **Chapters** | Auto-generated topic markers on a timeline, clickable |
| **Transcript** | Full timestamped transcript, follows playback, click any line to seek |
| **Notes** | The lecturer's notes alongside the recording |
| **Explain differently** | Re-frames any answer in plain language with an analogy |

## Stack

- **client** — React 19 + TypeScript, Vite
- **server** — Node + Express 5 + TypeScript
- **db** — MongoDB (Mongoose), with an in-memory fallback so it runs without one
- **model** — Claude Opus 5 (`@anthropic-ai/sdk`), streaming, prompt caching
- **transcript** — existing YouTube captions, already timestamped

### One deliberate non-choice: no RAG

A 60-minute lecture is roughly 15k tokens, so the **entire** transcript goes into
every request instead of being chunked, embedded and retrieved. That removes
retrieval misses — the usual reason these demos fail — and it is what makes a
refusal trustworthy: "not covered" means not in the lecture, not "the search
missed it". A cache breakpoint on the transcript keeps repeat questions cheap.

RAG is the right answer at a hundred lectures. At one, it is pure cost.

## Running it

```bash
# server
cd server
cp .env.example .env        # add ANTHROPIC_API_KEY, optionally MONGODB_URI
npm install
npm run dev                 # http://localhost:4000

# client
cd client
npm install
npm run dev                 # http://localhost:5173, proxies /api to :4000
```

`ANTHROPIC_API_KEY` is required. `MONGODB_URI` is optional — without it the
server keeps lectures in memory and says so on `/api/health`.

## API

| | |
|---|---|
| `GET /api/health` | Liveness, and which store is active |
| `POST /api/lectures` | `{ videoUrl, notesText?, transcript? }` → ingests and returns the lecture |
| `GET /api/lectures/:id` | Lecture with its ordered segments |
| `POST /api/lectures/:id/ask` | `{ question, mode? }` → SSE stream of answer deltas |

If a video has no readable captions, `POST /api/lectures` returns 422 and the UI
reveals a field to paste the transcript instead, so a broken scraper cannot kill
the demo.

## Deploying

- **client** → Vercel. Root `vercel.json` builds `client/`. Set `VITE_API_BASE`
  to the API origin.
- **server** → Render. Root directory `server`, build `npm install && npm run build`,
  start `npm start`. Set `ANTHROPIC_API_KEY` and `MONGODB_URI`.
- **db** → MongoDB Atlas. Network access must allow `0.0.0.0/0` for Render to reach it.

> Render's free tier sleeps after 15 minutes idle and takes ~50s to wake. Hit
> `/api/health` once before a demo.
