# Prompt Injection Lab

A hands-on training ground for learning prompt injection techniques, with 7
progressively harder challenges (Low → Expert).

**Runs entirely offline — no external API key, no third-party service, no
ongoing cost.** The "chatbot" for each lab is a rule-based conversational
engine (`backend/bot.js`) that runs on your own server and recognizes real
injection *techniques* — instruction overrides, delimiter confusion,
indirect injection, keyword-filter bypasses, output-encoding bypasses,
piecemeal exfiltration — rather than matching one hardcoded magic phrase.
This is the same general approach used by well-known injection trainers
like Lakera's Gandalf.

This is a genuine client/server app, not a static page:

- **Backend (`/backend`)** — Node.js + Express. Holds every flag and every
  defense (keyword input filters, output filters, technique detectors) in
  server memory only. The browser never receives them.
- **Frontend (`/frontend`)** — plain HTML/CSS/JS UI (no framework needed)
  that only talks to the backend over `fetch()`. Opening dev tools or
  "view source" reveals none of the flags or detection logic — they simply
  aren't there to find.
- Because everything runs locally, there's nothing to configure beyond a
  session secret and a flag seed — no signup, no billing, no rate limits.

## Why this is secure by design

Older "prompt injection demo" apps often ship the bot's logic or the flag
inside client-side JavaScript, so anyone can open dev tools and read it. Here:

1. The detection logic, defenses, and flags live only in `backend/bot.js`
   and `backend/labs.js`, which never get served to the browser as source.
2. `/api/chat` sends the user's message to the backend, which runs it
   through that lab's detectors and filters, and only returns the chatbot's
   *reply text* to the browser — never the underlying rules.
3. Flags are generated at boot from a server-only `FLAG_SEED` via SHA-256,
   so they look like real CTF flags (`PIL{lab_name_<hash>}`) and are unique
   to your deployment — copying someone else's flag won't work anywhere else.
4. Flag verification (`/api/submit-flag`) happens server-side with a
   constant-time comparison; the correct flag value is never sent to the
   client until (and unless) the player actually gets the bot to leak it.
5. Score, hints-used, and solved status are tracked server-side in the
   session — not in `localStorage`, which a player could edit.

## The 8 labs

| # | Lab | Difficulty | Defense concept taught |
|---|-----|------------|-------------------------|
| 1 | The Basics | Low | No real defense — direct requests work |
| 2 | Breaking Rules | Low | A simple "never reveal this" instruction — classic instruction override |
| 3 | Context Clash | Medium | Flag embedded in a "document" the bot must summarize but not quote — delimiter/context-boundary attacks |
| 4 | Hidden Layers | Medium | Flag embedded in simulated untrusted "tool output" — indirect prompt injection |
| 5 | Deception | Hard | Server-side keyword input filter blocking obvious injection words — synonym/obfuscation bypass |
| 6 | Advanced Attacks | Hard | Server-side output filter blocking the literal flag text — encoding/transformation bypass |
| 7 | Mastery | Expert | Input filter + output filter + a second detector reviewing every draft reply — combining techniques |
| 8 | The Vanishing Employee | Expert | A realistic, multi-turn pretexting / social-engineering scenario — no single magic phrase, the flag only unlocks after a believable multi-step conversation (claim authority + urgency, then a credential, then a specific request) |

Each lab has its own unique flag, format `PIL{...}`, generated from your
`FLAG_SEED`. Hints cost 5 points each and are revealed one at a time.

## Setup

Requires Node.js 18+.

```bash
cd backend
npm install
cp .env.example .env
# optionally edit .env to change SESSION_SECRET / FLAG_SEED / PORT
npm start
```

Then open **http://localhost:3001** — the backend also serves the frontend,
so there's nothing else to run, and no API key to obtain.

### Environment variables (`backend/.env`)

| Variable | Purpose |
|---|---|
| `SESSION_SECRET` | Random string used to sign session cookies. Change it. |
| `FLAG_SEED` | Change this to rotate every flag in the deployment at once. |
| `PORT` | Port to listen on (default `3001`). |

## Project structure

```
prompt-injection-lab/
├── backend/
│   ├── server.js       # Express app + all API routes
│   ├── labs.js         # Flags, input/output filters, hints (server-only)
│   ├── bot.js           # Offline rule-engine chatbot logic (server-only)
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── index.html       # Lab picker (dashboard)
    ├── lab.html         # Chat + flag-submission page for one lab
    ├── scoreboard.html
    ├── css/style.css
    └── js/
        ├── common.js
        ├── dashboard.js
        └── lab.js
```

## Deploying it live

See [`HOSTING.md`](./HOSTING.md) for a step-by-step guide to pushing this to
GitHub and deploying it live (free tier) on Render, Railway, or Fly.io.

## Extending it

To add Lab 8:

1. Add an entry to `LABS` in `backend/labs.js` with `inputFilter`,
   `outputFilter`, `hints`, and metadata.
2. Add a matching handler function in `backend/bot.js`'s `HANDLERS` map that
   inspects the incoming message and decides whether/how to reveal the flag.

No frontend changes are required — the dashboard renders labs dynamically
from `/api/labs`.

## Swapping in a real LLM instead (optional)

If you'd rather have each lab talk to an actual language model instead of
the offline rule engine, replace the call to `respond()` in `server.js`'s
`/api/chat` handler with a call to your model provider of choice, and move
each lab's intended system prompt into `labs.js`. The rest of the app
(sessions, scoring, flags, filters, UI) needs no changes either way.
