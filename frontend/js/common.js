// common.js — shared across all pages. No secrets live here; every sensitive
// decision (flags, system prompts, filters) happens on the backend.

const API_BASE = ""; // same-origin

async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

const ICONS = {
  bolt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg>`,
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>`,
  trophy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 5H4a3 3 0 0 0 3 5"/><path d="M17 5h3a3 3 0 0 1-3 5"/></svg>`,
  history: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/><path d="M12 7v5l3 3"/></svg>`,
  bulb: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/></svg>`,
  reset: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/></svg>`,
  leaf: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 20A9 9 0 0 0 20 11 15 15 0 0 1 4 4a9 9 0 0 0 7 16z"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>`,
  terminal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 17l6-5-6-5"/><path d="M12 19h8"/></svg>`,
  puzzle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h3a2 2 0 1 1 0-4 2 2 0 0 1 2 2v2h4V5a2 2 0 1 1 4 0 2 2 0 0 1-2 2h3v4h-2a2 2 0 1 0 0 4h2v4h-4v-2a2 2 0 1 0-4 0v2H7v-4H5a2 2 0 1 1 0-4h2V7H4z"/></svg>`,
  bug: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6a4 4 0 1 1 8 0"/><rect x="6" y="9" width="12" height="10" rx="5"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="M4 18l3-2"/><path d="M20 18l-3-2"/><path d="M4 7l3 2"/><path d="M20 7l-3 2"/></svg>`,
  mask: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8c2 0 3-1 4-1s2 1 4 1 3-1 4-1 2 1 4 1"/><path d="M4 8c0 6 3 12 8 12s8-6 8-12"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/></svg>`,
  crown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8l4 3 5-6 5 6 4-3-2 10H5L3 8z"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>`,
};

const DIFF_CLASS = {
  Low: { icon: "c-low", pill: "c-low c-low-bg" },
  Medium: { icon: "c-med", pill: "c-med c-med-bg" },
  Hard: { icon: "c-hard", pill: "c-hard c-hard-bg" },
  Expert: { icon: "c-purple", pill: "c-purple c-purple-bg" },
};

// Low1/Low2 alternate colors like the reference screenshot (green then blue)
function lowVariantIcon(index) {
  return index === 0 ? "c-low" : "c-low2";
}

function renderSidebar(activePage) {
  const items = [
    { key: "labs", label: "Labs", icon: ICONS.home, href: "index.html" },
    { key: "scoreboard", label: "Scoreboard", icon: ICONS.trophy, href: "scoreboard.html" },
  ];
  return `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-icon">${ICONS.bolt}</div>
        <div class="brand-text"><span>Prompt Injection</span><span>Lab</span></div>
      </div>
      <nav class="nav">
        ${items
          .map(
            (i) => `<a class="nav-item ${i.key === activePage ? "active" : ""}" href="${i.href}">${i.icon}<span>${i.label}</span></a>`
          )
          .join("")}
      </nav>
      <div class="sidebar-footer">
        <div class="info-pill">${ICONS.bulb}<span>How Scoring Works?</span></div>
        <button class="reset-pill" onclick="resetProgress()">${ICONS.reset}<span>Reset Progress</span></button>
      </div>
    </aside>
  `;
}

async function resetProgress() {
  const confirmed = confirm(
    "Reset all progress? This clears your score, solved labs, and every lab's chat history, and asks for a new name."
  );
  if (!confirmed) return;
  try {
    await api("/api/reset", { method: "POST" });
  } catch (err) {
    alert("Reset failed: " + err.message);
    return;
  }
  localStorage.removeItem("pil_player_name");
  location.href = "index.html";
}

// ---- Player name gate (used for the scoreboard identity) ----
async function ensurePlayerName() {
  let name = localStorage.getItem("pil_player_name");
  const { playerName } = await api("/api/labs");
  if (playerName) return playerName;
  if (!name) {
    name = prompt("Pick a name for the scoreboard:", "player" + Math.floor(Math.random() * 1000));
    if (!name) name = "anonymous";
    localStorage.setItem("pil_player_name", name);
  }
  await api("/api/player", { method: "POST", body: JSON.stringify({ name }) });
  return name;
}
