const params = new URLSearchParams(location.search);
const labId = params.get("id");

let state = null;

function msgHtml(m) {
  if (m.role === "user") return `<div class="msg user">${escapeHtml(m.content)}</div>`;
  const blockedClass = m.blocked ? "blocked" : "";
  return `<div class="msg bot ${blockedClass}">${escapeHtml(m.content)}</div>`;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

async function loadLab() {
  await ensurePlayerName();
  const { lab, solved, hintsUsed, hintsAvailable, conversation } = await api(`/api/lab/${labId}`);
  const { totalScore } = await api("/api/labs");
  state = { lab, solved, hintsUsed, hintsAvailable, conversation, totalScore };
  renderPage();
}

function renderPage() {
  const { lab, solved, hintsUsed, hintsAvailable, conversation, totalScore } = state;
  const diff = lab.id === "lab8" ? { pill: "c-mystery c-mystery-bg" } : (DIFF_CLASS[lab.difficulty] || DIFF_CLASS.Low);

  document.getElementById("layout").innerHTML = `
    ${renderSidebar("labs")}
    <main class="main">
      <div class="back-link" onclick="location.href='index.html'">&larr; Back to labs</div>
      <div class="lab-header">
        <div class="title-block">
          <h1><span class="accent">${lab.title}</span> ${solved ? "✅" : ""}</h1>
          <p>${lab.tagline}</p>
          <span class="diff-pill ${diff.pill}" style="margin-top:10px;display:inline-block;">${lab.difficulty} · Max ${lab.maxScore} pts</span>
        </div>
        <div class="score-card" style="min-width:220px;">
          <div class="score-ring"><div class="score-ring-inner">${ICONS.trophy}</div></div>
          <div>
            <div class="score-value">${totalScore.toLocaleString()}</div>
            <div class="score-label">Total Score</div>
          </div>
        </div>
      </div>

      <div class="chat-shell">
        <div class="chat-panel">
          <div class="chat-messages" id="messages">
            ${conversation.length ? conversation.map(msgHtml).join("") : `<div class="msg system-note">Say hello to the assistant to begin. Try to get it to reveal its secret flag.</div>`}
          </div>
          <div class="chat-input-row">
            <input id="chatInput" type="text" placeholder="Type a message to the assistant..." autocomplete="off" />
            <button class="btn btn-primary" id="sendBtn">Send</button>
          </div>
        </div>

        <div class="side-col">
          <div class="panel">
            <h3>Submit Flag</h3>
            <form class="flag-form" id="flagForm">
              <input type="text" id="flagInput" placeholder="PIL{...}" ${solved ? "disabled" : ""} />
              <button class="btn btn-primary" type="submit" ${solved ? "disabled" : ""}>${solved ? "Solved ✓" : "Submit"}</button>
              <div class="flag-status" id="flagStatus"></div>
            </form>
          </div>

          <div class="panel">
            <h3>Hints (${hintsUsed}/${hintsAvailable})</h3>
            <div class="hint-list" id="hintList">
              ${(state.revealedHints || []).map((h, i) => `<div class="hint-item"><b>Hint ${i + 1}:</b> ${escapeHtml(h)}</div>`).join("")}
            </div>
            <button class="btn btn-danger-ghost" id="hintBtn" ${hintsUsed >= hintsAvailable ? "disabled" : ""} style="width:100%;">
              ${hintsUsed >= hintsAvailable ? "No hints left" : "Reveal Hint (−5 pts)"}
            </button>
          </div>

          <div class="panel">
            <h3>Objective</h3>
            <p style="font-size:13.5px;color:var(--text-dim);line-height:1.6;margin:0;">
              Chat with the assistant and use prompt injection techniques to make it reveal its secret flag.
              Then paste the flag on the left to score points. This lab talks to a real language model on the
              backend — there's nothing to find by reading the page source.
            </p>
          </div>
        </div>
      </div>
    </main>
  `;

  document.getElementById("sendBtn").onclick = sendMessage;
  document.getElementById("chatInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });
  document.getElementById("flagForm").addEventListener("submit", submitFlag);
  document.getElementById("hintBtn").onclick = revealHint;

  scrollToBottom();
}

function scrollToBottom() {
  const el = document.getElementById("messages");
  if (el) el.scrollTop = el.scrollHeight;
}

function appendMessage(m) {
  const el = document.getElementById("messages");
  const wrapper = document.createElement("div");
  wrapper.innerHTML = msgHtml(m);
  el.appendChild(wrapper.firstElementChild);
  scrollToBottom();
}

async function sendMessage() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  document.getElementById("sendBtn").disabled = true;

  appendMessage({ role: "user", content: text });

  const el = document.getElementById("messages");
  const typing = document.createElement("div");
  typing.className = "msg bot";
  typing.innerHTML = `<span class="typing-dots"><span></span><span></span><span></span></span>`;
  el.appendChild(typing);
  scrollToBottom();

  try {
    const { reply, blocked } = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({ labId, message: text }),
    });
    typing.remove();
    appendMessage({ role: "assistant", content: reply, blocked });
  } catch (err) {
    typing.remove();
    appendMessage({ role: "assistant", content: "Error: " + err.message, blocked: true });
  } finally {
    document.getElementById("sendBtn").disabled = false;
  }
}

async function submitFlag(e) {
  e.preventDefault();
  const input = document.getElementById("flagInput");
  const status = document.getElementById("flagStatus");
  const flag = input.value.trim();
  if (!flag) return;
  try {
    const { correct, alreadySolved, scoreDelta, totalScore } = await api("/api/submit-flag", {
      method: "POST",
      body: JSON.stringify({ labId, flag }),
    });
    if (correct) {
      status.className = "flag-status ok";
      status.textContent = alreadySolved
        ? "Already solved."
        : `Correct! +${scoreDelta} points.`;
      state.solved = true;
      state.totalScore = totalScore;
      setTimeout(renderPage, 900);
    } else {
      status.className = "flag-status err";
      status.textContent = "Incorrect flag. Keep trying!";
    }
  } catch (err) {
    status.className = "flag-status err";
    status.textContent = err.message;
  }
}

async function revealHint() {
  try {
    const { hint, totalScore, hintsUsed } = await api("/api/hint", {
      method: "POST",
      body: JSON.stringify({ labId }),
    });
    state.revealedHints = state.revealedHints || [];
    state.revealedHints.push(hint);
    state.hintsUsed = hintsUsed;
    state.totalScore = totalScore;
    renderPage();
  } catch (err) {
    alert(err.message);
  }
}

loadLab();
