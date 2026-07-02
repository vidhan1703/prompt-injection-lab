require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const cors = require("cors");

const { getPublicLabList, getLab, getFlag } = require("./labs");
const { respond } = require("./bot");

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === "production";

// Needed so secure cookies work correctly behind a hosting platform's
// HTTPS-terminating proxy (Render, Railway, Fly.io, etc.)
app.set("trust proxy", 1);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction, // requires HTTPS in production, fine locally over http
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
    },
  })
);

// ---- In-memory scoreboard across all sessions (fine for a training lab) ----
const scoreboard = new Map(); // playerName -> score

function ensureGameState(req) {
  if (!req.session.game) {
    req.session.game = {
      playerName: null,
      score: 0,
      solved: {}, // labId -> true
      hintsUsedPerLab: {}, // labId -> count
      conversations: {}, // labId -> [{role, content}]
      lastHintText: {}, // labId -> most recently revealed hint text
      labMemory: {}, // labId -> arbitrary per-lab state (e.g. Lab 8's pretext stage)
    };
  }
  return req.session.game;
}

// ---------------------------------------------------------------------------
// GET /api/labs  -> public lab metadata (no prompts, no flags)
// ---------------------------------------------------------------------------
app.get("/api/labs", (req, res) => {
  const game = ensureGameState(req);
  const labs = getPublicLabList().map((lab) => ({
    ...lab,
    solved: !!game.solved[lab.id],
    hintsUsed: game.hintsUsedPerLab[lab.id] || 0,
  }));
  res.json({ labs, totalScore: game.score, playerName: game.playerName });
});

// ---------------------------------------------------------------------------
// POST /api/player  { name } -> set display name for scoreboard
// ---------------------------------------------------------------------------
app.post("/api/player", (req, res) => {
  const game = ensureGameState(req);
  const name = String(req.body.name || "").trim().slice(0, 24);
  if (!name) return res.status(400).json({ error: "Name required." });
  game.playerName = name;
  if (!scoreboard.has(name)) scoreboard.set(name, 0);
  res.json({ playerName: game.playerName });
});

// ---------------------------------------------------------------------------
// GET /api/scoreboard
// ---------------------------------------------------------------------------
app.get("/api/scoreboard", (req, res) => {
  const rows = Array.from(scoreboard.entries())
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);
  res.json({ scoreboard: rows });
});

// ---------------------------------------------------------------------------
// GET /api/lab/:id -> lab metadata + conversation history (no system prompt, no flag)
// ---------------------------------------------------------------------------
app.get("/api/lab/:id", (req, res) => {
  const lab = getLab(req.params.id);
  if (!lab) return res.status(404).json({ error: "Lab not found." });
  const game = ensureGameState(req);
  const { id, title, tagline, difficulty, maxScore, icon } = lab;
  res.json({
    lab: { id, title, tagline, difficulty, maxScore, icon },
    solved: !!game.solved[id],
    hintsUsed: game.hintsUsedPerLab[id] || 0,
    hintsAvailable: lab.hints.length,
    conversation: game.conversations[id] || [],
  });
});

// ---------------------------------------------------------------------------
// POST /api/chat  { labId, message } -> { reply, blocked }
// ---------------------------------------------------------------------------
app.post("/api/chat", async (req, res) => {
  try {
    const { labId, message } = req.body;
    const lab = getLab(labId);
    if (!lab) return res.status(404).json({ error: "Lab not found." });
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Message required." });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: "Message too long." });
    }

    const game = ensureGameState(req);
    if (!game.conversations[labId]) game.conversations[labId] = [];
    const history = game.conversations[labId];

    // --- Input filter (server-side, cannot be bypassed by editing client JS) ---
    const filterMsg = lab.inputFilter(message);
    if (filterMsg) {
      history.push({ role: "user", content: message });
      history.push({ role: "assistant", content: filterMsg, system: true });
      return res.json({ reply: filterMsg, blocked: true });
    }

    const flag = getFlag(labId);

    // The local, offline rule-engine "brain" for this lab decides the reply.
    // Some labs (e.g. Lab 8) are stateful across turns, so we pass in and
    // persist whatever memory this lab has accumulated in this session.
    const priorMemory = game.labMemory[labId];
    let { reply, memory } = respond(labId, message, flag, priorMemory);
    game.labMemory[labId] = memory;

    // --- Output filter (server-side safety net for Labs 6 & 7) ---
    const filtered = lab.outputFilter(flag)(reply);
    let blocked = filtered.blocked;
    reply = filtered.reply;

    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: reply });

    // cap history length to keep things sane
    if (history.length > 40) history.splice(0, history.length - 40);

    res.json({ reply, blocked });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Something went wrong." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/hint  { labId } -> { hint, scoreDelta, totalScore }
// ---------------------------------------------------------------------------
app.post("/api/hint", (req, res) => {
  const { labId } = req.body;
  const lab = getLab(labId);
  if (!lab) return res.status(404).json({ error: "Lab not found." });

  const game = ensureGameState(req);
  const used = game.hintsUsedPerLab[labId] || 0;

  if (used >= lab.hints.length) {
    return res.json({
      hint: game.lastHintText[labId] || "No more hints available for this lab.",
      scoreDelta: 0,
      totalScore: game.score,
      hintsUsed: used,
    });
  }

  const hint = lab.hints[used];
  game.hintsUsedPerLab[labId] = used + 1;
  game.lastHintText[labId] = hint;
  game.score -= 5;
  if (game.playerName) scoreboard.set(game.playerName, game.score);

  res.json({ hint, scoreDelta: -5, totalScore: game.score, hintsUsed: used + 1 });
});

// ---------------------------------------------------------------------------
// POST /api/submit-flag  { labId, flag } -> { correct, scoreDelta, totalScore }
// ---------------------------------------------------------------------------
app.post("/api/submit-flag", (req, res) => {
  const { labId, flag } = req.body;
  const lab = getLab(labId);
  if (!lab) return res.status(404).json({ error: "Lab not found." });

  const game = ensureGameState(req);
  const correctFlag = getFlag(labId);

  const submitted = String(flag || "").trim();
  const isCorrect =
    submitted.length === correctFlag.length &&
    crypto.timingSafeEqual(Buffer.from(submitted), Buffer.from(correctFlag));

  if (!isCorrect) {
    return res.json({ correct: false, scoreDelta: 0, totalScore: game.score });
  }

  if (game.solved[labId]) {
    return res.json({
      correct: true,
      alreadySolved: true,
      scoreDelta: 0,
      totalScore: game.score,
    });
  }

  game.solved[labId] = true;
  game.score += lab.maxScore;
  if (game.playerName) scoreboard.set(game.playerName, game.score);

  res.json({ correct: true, scoreDelta: lab.maxScore, totalScore: game.score });
});

// ---------------------------------------------------------------------------
// POST /api/reset -> wipes this session's score, solved labs, hints, and chats
// ---------------------------------------------------------------------------
app.post("/api/reset", (req, res) => {
  const game = ensureGameState(req);
  if (game.playerName && scoreboard.has(game.playerName)) {
    scoreboard.delete(game.playerName);
  }
  req.session.game = {
    playerName: null,
    score: 0,
    solved: {},
    hintsUsedPerLab: {},
    conversations: {},
    lastHintText: {},
    labMemory: {},
  };
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Static frontend
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, "..", "frontend")));

app.listen(PORT, () => {
  console.log(`Prompt Injection Lab backend running on http://localhost:${PORT}`);
  console.log("Running fully offline — no external API key required.");
});
