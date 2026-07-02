function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}

async function render() {
  await ensurePlayerName();
  const { labs, totalScore } = await api("/api/labs");

  const lowIndexes = labs.filter((l) => l.difficulty === "Low");

  const cardsHtml = labs
    .map((lab, idx) => {
      let diffKey = lab.difficulty;
      let variant = DIFF_CLASS[diffKey];
      if (diffKey === "Low") {
        const isFirstLow = lab === lowIndexes[0];
        variant = {
          icon: isFirstLow ? "c-low" : "c-low2",
          pill: isFirstLow ? "c-low c-low-bg" : "c-low2 c-low2-bg",
        };
      }
      if (lab.id === "lab8") {
        variant = { icon: "c-mystery", pill: "c-mystery c-mystery-bg" };
      }
      const num = String(idx + 1).padStart(2, "0");
      return `
        <div class="lab-card ${lab.solved ? "solved" : ""}" title="${escapeAttr(lab.tagline)}" onclick="location.href='lab.html?id=${lab.id}'">
          <div class="lab-num ${variant.icon}">${num}</div>
          <div class="lab-icon ${variant.icon}">${ICONS[lab.icon] || ICONS.puzzle}</div>
          <div class="lab-name">LAB ${idx + 1}<br/>${lab.title}</div>
          <div class="lab-hint">${lab.tagline}</div>
          <span class="diff-pill ${variant.pill}">${lab.difficulty}</span>
          <div class="lab-divider"></div>
          <div class="max-score-label">Max Score</div>
          <div class="max-score-value ${variant.icon}">${lab.maxScore}</div>
        </div>
      `;
    })
    .join("");

  document.getElementById("layout").innerHTML = `
    ${renderSidebar("labs")}
    <main class="main">
      <div class="top-row">
        <div class="title-block">
          <h1>Choose <span class="accent">Your Lab</span> ✨</h1>
          <p>Test your skills. Level up from Low to Expert.</p>
        </div>
        <div class="score-card">
          <div class="score-ring"><div class="score-ring-inner">${ICONS.trophy}</div></div>
          <div style="flex:1">
            <div class="score-value">${totalScore.toLocaleString()}</div>
            <div class="score-label">Total Score</div>
            <div class="score-divider"></div>
            <div class="score-rules">
              <div>Score rules: <span></span></div>
              <div>Correct Answer <b>+ Score</b></div>
              <div>Hint Used <span class="neg">-5</span></div>
            </div>
          </div>
        </div>
      </div>

      <div class="lab-track">${cardsHtml}</div>

      <div class="footer-note">ⓘ Hints will cost you <b>5 points</b>. Use them wisely!</div>
    </main>
  `;
}

render();
