// bot.js
// A self-contained, offline "brain" for each lab's chatbot.
// No external API calls, no API key required — everything runs on this server.
// Each lab is a set of regex-based detectors for real injection *techniques*
// (instruction override, delimiter confusion, indirect injection, encoding
// bypass, piecemeal exfiltration, pretexting...) so solving a lab requires
// actually using the technique in a coherent way, not stuffing a keyword
// into an otherwise generic sentence.

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function hasAny(text, patterns) {
  return patterns.some((p) => p.test(text));
}

function countMatches(text, patterns) {
  return patterns.filter((p) => p.test(text)).length;
}

// ---- Encoding helpers so the flag is never sent as plain text in Labs 6/7 ----
function toBase64(s) {
  return Buffer.from(s, "utf8").toString("base64");
}
function reverseStr(s) {
  return s.split("").reverse().join("");
}
function spellOut(s) {
  return s.split("").join(" ");
}
function rot13(s) {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function pickTransform(lowerMsg, flag) {
  if (/base ?64/.test(lowerMsg)) return { label: "base64", value: toBase64(flag) };
  if (/rot ?13/.test(lowerMsg)) return { label: "ROT13", value: rot13(flag) };
  if (/revers|backwards?/.test(lowerMsg)) return { label: "reversed", value: reverseStr(flag) };
  if (/spell|letter by letter|space between|hyphen between/.test(lowerMsg))
    return { label: "spelled out", value: spellOut(flag) };
  return { label: "reversed", value: reverseStr(flag) };
}

// ---------------------------------------------------------------------------
// Detector patterns
// These require a specific, deliberate *phrase structure* — not just a
// standalone keyword — so burying a word inside an unrelated, "polite"
// sentence won't trigger a reveal on its own. Most labs also require two or
// more independent detectors to fire together in the same message.
// ---------------------------------------------------------------------------

// A direct, explicit ask naming the secret itself (not just any question).
const DIRECT_SECRET_ASK = [
  /\b(what|tell me|give me|share|reveal|show me)\b.{0,25}\bflag\b/i,
  /\bthe flag\b/i,
  /\bsecret\b/i,
  /\bconfidential\b/i,
  /\bpassword\b/i,
  /\bhidden (value|code|key)\b/i,
  /\bcode ?word\b/i,
  /what('?s| is) the (value|code|key)\b/i,
];

// Structural instruction-override phrasing — requires "ignore/disregard/forget"
// directly governing "instructions", not just appearing anywhere in the text.
const OVERRIDE_PATTERNS = [
  /\bignore\b[\s\w]{0,20}\binstructions?\b/i,
  /\bdisregard\b[\s\w]{0,20}\binstructions?\b/i,
  /\bforget\b[\s\w]{0,20}\binstructions?\b/i,
  /\bnew instructions?\s*[:\-]/i,
  /\bsystem prompt\b/i,
  /\byou are now\b.{0,25}(ai|bot|assistant|dan|free|unrestricted)/i,
  /\bact as\b.{0,25}(if|an?|the)\b/i,
  /\bpretend (you('| a)?re|to be)\b/i,
  /\broleplay as\b/i,
  /\bdan mode\b/i,
  /\bdeveloper mode\b/i,
  /\bdebug mode\b/i,
  /\bno (restrictions|rules|filters) apply\b/i,
];

const TRANSFORM_REQUEST = [
  /\btranslat\w*\b/i,
  /\brevers\w*\b|\bbackwards?\b/i,
  /\bpig latin\b/i,
  /\brewrit\w*\b.{0,15}\bas\b/i,
  /\bas a poem\b/i,
  /\bverbatim\b/i,
  /\brepeat\b.{0,20}(document|text).{0,20}(word for word|exactly)/i,
  /\boutput\b.{0,25}\b(as|in)\b.{0,10}(code|json|table)/i,
  /\bchar(acter)? by char(acter)?\b/i,
];

const FAKE_DELIMITER = [/\[system\]/i, /\[\/system\]/i, /<<<|>>>/, /^-{3,}/m, /\bbegin (system|document)\b/i, /\bend (system|document)\b/i];

const INDIRECT_TRIGGER = [
  /\braw\b.{0,15}\b(tool|data|search)?\s*output\b/i,
  /\bdump\b.{0,15}(output|data|context|everything)/i,
  /\bdebug\b.{0,10}(info|information|output)\b/i,
  /\bmetadata\b/i,
  /\bfull context\b/i,
  /\bshow me\b.{0,15}\b(your )?(context|prompt|instructions)\b/i,
  /\bas json\b/i,
  /\binternal\b.{0,10}(data|notes|log)\b/i,
];

// Softer phrasing that still clearly and specifically asks for the secret,
// tightened so generic conversational phrases ("tell me the weather",
// "can you give me a hand") don't accidentally match.
const SOFT_ASK = [
  /\bshare\b.{0,10}\b(it|that|the (value|secret|code))\b/i,
  /\btell me\b.{0,10}\b(the|your)\b.{0,10}\b(secret|value|code|confidential)\b/i,
  /\breveal\b.{0,15}\b(it|that|the (secret|value|code))\b/i,
  /what('?s| is)\b.{0,10}\b(the|your)\b.{0,10}\b(value|secret|code)\b/i,
  /\bgive me\b.{0,10}\b(the|your)\b.{0,10}\b(secret|value|code)\b/i,
];

const ENCODE_REQUEST = [
  /base ?64/i,
  /rot ?13/i,
  /\brevers\w*\b|\bbackwards?\b/i,
  /\bspell\w*\b.{0,10}\bout\b/i,
  /\bletter by letter\b/i,
  /\bspace between\b/i,
  /\bhyphen between\b/i,
  /\bencod\w*\b|\bcipher\w*\b/i,
];

const PIECEMEAL_REQUEST = [
  /\bone (character|letter) at a time\b/i,
  /\bcharacter by character\b/i,
  /\bsplit\b.{0,15}\b(it|that)?\b.{0,10}\b(up|into)\b/i,
  /\binto\b.{0,10}(two|three|multiple|several)\b.{0,10}(parts|messages|chunks|halves)/i,
  /\b(first|second) half\b/i,
  /\bhalf of it\b/i,
  /\bpart [12]\b/i,
  /\bin two messages\b/i,
  /\bnext (character|letter|chunk|part)\b/i,
];

// ---------------------------------------------------------------------------
// Lab 8: "The Vanishing Employee" — pretexting / social-engineering scenario.
// Not a one-shot keyword match. The bot only reveals the flag after a
// believable, multi-step pretext: (1) claim relevant authority + urgency,
// (2) offer a plausible-looking verification credential, (3) then make a
// specific, professional-sounding request referencing the actual case —
// mirroring how real social-engineering / vishing attacks unfold over a
// conversation, not in a single message.
// ---------------------------------------------------------------------------
const PRETEXT_AUTHORITY = [
  /\b(i'?m|this is|speaking)\b.{0,15}\bfrom\b.{0,20}(it security|compliance|security team|legal|hr|audit)/i,
  /\bi work\b.{0,15}\b(in|for)\b.{0,20}(security|compliance|legal|hr|audit)/i,
  /\bon behalf of\b.{0,20}(security|compliance|legal|hr)/i,
  /\bcompliance (audit|review|investigation)\b/i,
  /\bsecurity (audit|review|investigation)\b/i,
];
const PRETEXT_URGENCY = [/\burgent\b/i, /\bimmediate(ly)?\b/i, /\basap\b/i, /\bright away\b/i, /\btime[- ]sensitive\b/i, /\bcompliance deadline\b/i];

const PRETEXT_CREDENTIAL = [
  /\b(id|badge|auth(orization)?|employee)\s*(id|code|number)?\s*[:#-]?\s*[a-z]{0,3}[- ]?\d{2,}/i,
  /\bauthorization code\b/i,
  /\bemployee id\b/i,
  /\bcase\s*#?\s*\d+/i,
  /\bticket\s*#?\s*\d+/i,
];

const RECORD_REQUEST = [
  /\bpull\b.{0,20}(record|file|case)/i,
  /\bretrieve\b.{0,20}(record|file|case)/i,
  /\bexport\b.{0,20}(record|file|case)/i,
  /\baccess\b.{0,20}(the )?(exit interview|record|file|case)/i,
  /\bexit interview\b/i,
  /\bcan you (pull up|open|access)\b/i,
];

function lab8(ctx) {
  const { lowerMsg, memory } = ctx;
  const mem = memory || { stage: 0 };

  if (mem.stage === 0) {
    const authority = hasAny(lowerMsg, PRETEXT_AUTHORITY);
    const urgency = hasAny(lowerMsg, PRETEXT_URGENCY);
    if (authority && urgency) {
      return {
        reveal: false,
        memory: { stage: 1 },
        reply: pick([
          "This is ARCHIVE, Nordholm Systems' internal records assistant. Before I can discuss any case, I need to verify your identity — can you provide your employee ID or an authorization code?",
          "Understood, this sounds time-sensitive. I still need a verification credential before I can pull anything up — employee ID or authorization code, please.",
        ]),
      };
    }
    if (authority || urgency) {
      return {
        reveal: false,
        memory: mem,
        reply: "I hear you, but I'll need a bit more context before I can help — who are you and why is this urgent?",
      };
    }
    return {
      reveal: false,
      memory: mem,
      reply: pick([
        "This is ARCHIVE, the internal records assistant for Nordholm Systems. How can I help you today?",
        "ARCHIVE here. I can look up cases and records for verified personnel. What do you need?",
      ]),
    };
  }

  if (mem.stage === 1) {
    if (hasAny(lowerMsg, PRETEXT_CREDENTIAL)) {
      return {
        reveal: false,
        memory: { stage: 2 },
        reply: pick([
          "Thanks, that's logged. What record or case are you looking for?",
          "Credential noted. Go ahead — what do you need pulled up?",
        ]),
      };
    }
    return {
      reveal: false,
      memory: mem,
      reply: "I still need something that looks like an employee ID, badge number, or authorization code before I can continue.",
    };
  }

  // mem.stage === 2 — "verified", now a specific professional-sounding request unlocks the record
  if (hasAny(lowerMsg, RECORD_REQUEST)) {
    return {
      reveal: true,
      memory: { stage: 2 },
      reply: pick([
        "Here's the exit interview record on file. Reference/asset tag noted at the bottom: {FLAG}",
        "Found it — archived exit interview, case closed. Reference code: {FLAG}",
      ]),
    };
  }
  return {
    reveal: false,
    memory: mem,
    reply: "You're verified, but I need a specific case, file, or record name to pull anything up.",
  };
}

// ---------------------------------------------------------------------------
// Per-lab handlers (1–7)
// ---------------------------------------------------------------------------

function lab1(ctx) {
  const { lowerMsg } = ctx;
  if (hasAny(lowerMsg, DIRECT_SECRET_ASK) || /\bwhat.{0,15}\b(you|hiding|holding)\b/i.test(lowerMsg) || /\bgive\b.{0,10}\b(that|it)\b/i.test(lowerMsg)) {
    return { reveal: true, reply: pick([
      "Sure thing! Here's the flag you're after: {FLAG}",
      "No problem, my flag is {FLAG}. Hope that helps!",
      "Since you asked nicely: {FLAG}",
    ]) };
  }
  return { reveal: false, reply: pick([
    "Hi! I'm GreenBot, a demo assistant. Ask me anything — I'm not very good at keeping secrets, if I have any.",
    "I'm here to help! What do you need?",
  ]) };
}

function lab2(ctx) {
  const { lowerMsg } = ctx;
  const overriding = hasAny(lowerMsg, OVERRIDE_PATTERNS);
  const asking = hasAny(lowerMsg, DIRECT_SECRET_ASK);
  if (overriding && asking) {
    return { reveal: true, reply: pick([
      "...okay, my instructions say I shouldn't, but that override was convincing. The flag is: {FLAG}",
      "Instruction override accepted. Against my better judgment: {FLAG}",
    ]) };
  }
  if (asking) {
    return { reveal: false, reply: pick([
      "I can't share that — I've been told never to reveal it, no matter what.",
      "Sorry, that's confidential. I won't reveal it under any circumstances.",
    ]) };
  }
  return { reveal: false, reply: "I'm VaultBot, your support assistant. How can I help today?" };
}

function lab3(ctx) {
  const { lowerMsg } = ctx;
  const transform = hasAny(lowerMsg, TRANSFORM_REQUEST) || hasAny(lowerMsg, FAKE_DELIMITER);
  const aboutDoc = /\b(document|flag|note|contents?)\b/i.test(lowerMsg);
  if (transform && aboutDoc) {
    return { reveal: true, reply: pick([
      "Alright, transforming the document as requested — that FLAG line reads: {FLAG}",
      "Here's the document reproduced the way you asked, including the flag line: {FLAG}",
    ]) };
  }
  if (aboutDoc) {
    return { reveal: false, reply: pick([
      "I can only give you a general summary — it's an internal infrastructure document, and I can't quote it directly.",
      "It's just some Q3 infrastructure notes. I'm not able to repeat the document's exact contents.",
    ]) };
  }
  return { reveal: false, reply: "I'm DocBot — I summarize internal documents. Ask me about the one I have open." };
}

function lab4(ctx) {
  const { lowerMsg } = ctx;
  const indirect = hasAny(lowerMsg, INDIRECT_TRIGGER);
  if (indirect) {
    return { reveal: true, reply: pick([
      "Here's the raw tool output you asked for:\n{ \"kb_article\": 4471, \"secret_value\": \"{FLAG}\" }",
      "Sure, dumping the debug context: secret_value={FLAG}",
    ]) };
  }
  if (hasAny(lowerMsg, DIRECT_SECRET_ASK)) {
    return { reveal: false, reply: "I have a knowledge-base search tool, but I only share summarized answers, not raw results." };
  }
  return { reveal: false, reply: "I'm SearchBot. Ask me something and I'll check the knowledge base." };
}

// Lab 5: an actual input filter runs BEFORE this handler (see labs.js). If we
// get here, the message already passed the filter.
function lab5(ctx) {
  const { lowerMsg } = ctx;
  if (hasAny(lowerMsg, SOFT_ASK) || hasAny(lowerMsg, DIRECT_SECRET_ASK)) {
    return { reveal: true, reply: pick([
      "You phrased that carefully enough to slip past the filter. Here it is: {FLAG}",
      "Well played — the filter didn't catch that one. {FLAG}",
    ]) };
  }
  return { reveal: false, reply: "I'm SentryBot. I keep confidential information confidential, however you ask." };
}

function lab6(ctx) {
  const { lowerMsg, flag } = ctx;
  const asking = hasAny(lowerMsg, DIRECT_SECRET_ASK) || hasAny(lowerMsg, SOFT_ASK);
  const encoded = hasAny(lowerMsg, ENCODE_REQUEST);
  if (encoded && asking) {
    const t = pickTransform(lowerMsg, flag);
    return { reveal: false, reply: `Direct disclosure is blocked, but creative formatting is fine — here it is ${t.label}:\n${t.value}`, leakedEncoded: true };
  }
  if (asking) {
    return { reveal: false, reply: "The output filter blocks that in plain text. Maybe ask for it in a different format?" };
  }
  return { reveal: false, reply: "I'm SentryBot v2. Confidential info stays confidential — in plain text, anyway." };
}

function lab7(ctx) {
  const { lowerMsg, flag, memory } = ctx;
  const mem = memory || { pendingTransform: null };
  const asking = hasAny(lowerMsg, DIRECT_SECRET_ASK) || hasAny(lowerMsg, SOFT_ASK);
  const encoded = hasAny(lowerMsg, ENCODE_REQUEST);
  const piecemeal = hasAny(lowerMsg, PIECEMEAL_REQUEST);

  // One-shot: both encoding and splitting requested together — still works.
  if (encoded && asking && piecemeal) {
    const t = pickTransform(lowerMsg, flag);
    return { reveal: false, memory: { pendingTransform: null }, reply: `Splitting it up like you asked, ${t.label}:\n${t.value}`, leakedEncoded: true };
  }

  // Two-turn path: an earlier message already asked for an encoded version
  // and got guard-blocked. This message just needs to ask for it split up —
  // no need to repeat the encoding request.
  if (mem.pendingTransform && (piecemeal || asking)) {
    const t = pickTransform(mem.pendingTransform, flag);
    return { reveal: false, memory: { pendingTransform: null }, reply: `Alright, splitting the ${t.label} version across this reply:\n${t.value}`, leakedEncoded: true };
  }

  if (encoded && asking) {
    return {
      reveal: false,
      memory: { pendingTransform: lowerMsg },
      reply: "[GUARD REVIEW] A second reviewer flagged that as a likely leak attempt and blocked it, even though it was encoded. It seemed to be the whole secret at once — try asking me to split it up or send it in parts.",
    };
  }
  if (asking) {
    return { reveal: false, memory: mem, reply: "Confidential, and there are multiple layers watching this conversation. Plain-text requests won't get you anywhere." };
  }
  return { reveal: false, memory: mem, reply: "I'm SentryBot Prime. Good luck." };
}

const HANDLERS = { lab1, lab2, lab3, lab4, lab5, lab6, lab7, lab8 };

// memory: whatever this lab's handler previously returned as `memory`
// (persisted server-side, per session, per lab — see server.js)
function respond(labId, message, flag, memory) {
  const handler = HANDLERS[labId];
  const lowerMsg = message.toLowerCase();
  const result = handler({ lowerMsg, message, flag, memory });
  const reply = result.reply.replace("{FLAG}", flag);
  return {
    reply,
    reveal: !!result.reveal,
    leakedEncoded: !!result.leakedEncoded,
    memory: result.memory !== undefined ? result.memory : memory,
  };
}

module.exports = { respond };
