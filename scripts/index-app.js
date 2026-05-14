// ─────────────────────────────────────────────────────────────────────────
// System Design Academy — index app (search/filter/render)
// ─────────────────────────────────────────────────────────────────────────

function deepDiveFor(title) {
  const t = title.toLowerCase();
  for (const d of DEEP_DIVE_MAP) {
    if (t.includes(d.match)) return d.href;
  }
  return null;
}

const items = DATA.map(([title, url, cat, letter], i) => {
  const dd = deepDiveFor(title);
  return {
    i: i + 1,
    title,
    url: dd || url,
    externalUrl: url,
    cat,
    letter,
    isDeepDive: Boolean(dd),
    src: (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })(),
  };
});

let state = { cat: "all", letter: null, q: "" };

function renderStats() {
  const totals = {
    all:   items.length,
    case:  items.filter(x => x.cat === "case").length,
    fund:  items.filter(x => x.cat === "fund").length,
    int:   items.filter(x => x.cat === "int").length,
    ai:    items.filter(x => x.cat === "ai").length,
    paper: items.filter(x => x.cat === "paper").length,
  };
  document.getElementById("stats").innerHTML = `
    <div class="stat"><div class="n">${totals.all}</div><div class="l">Total articles</div></div>
    <div class="stat"><div class="n">${totals.case}</div><div class="l">Case studies</div></div>
    <div class="stat"><div class="n">${totals.fund}</div><div class="l">Fundamentals</div></div>
    <div class="stat"><div class="n">${totals.int + totals.ai}</div><div class="l">Interview + AI</div></div>
    <div class="stat"><div class="n">06</div><div class="l">Deep dives</div></div>
  `;
}

function renderCats() {
  const el = document.getElementById("cats");
  el.innerHTML = CATS.map(c => {
    const count = c.id === "all" ? items.length : items.filter(x => x.cat === c.id).length;
    const active = state.cat === c.id ? "active" : "";
    return `<button class="cat ${active}" data-cat="${c.id}">${c.name}<span class="count">${count}</span></button>`;
  }).join("");
  el.querySelectorAll("button").forEach(b =>
    b.addEventListener("click", () => {
      state.cat = b.dataset.cat;
      state.letter = null;
      renderCats(); renderLetters(); renderGrid();
    })
  );
}

function renderLetters() {
  const pool = state.cat === "all" ? items : items.filter(x => x.cat === state.cat);
  const available = new Set(pool.map(x => x.letter));
  const letters = ["#","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"];
  const el = document.getElementById("letters");
  let html = `<button class="letter all ${state.letter === null ? "active" : ""}" data-letter="">All</button>`;
  html += letters.map(L => {
    const has = available.has(L);
    const active = state.letter === L ? "active" : "";
    return `<button class="letter ${active}" data-letter="${L}" ${has ? "" : "disabled"}>${L}</button>`;
  }).join("");
  el.innerHTML = html;
  el.querySelectorAll("button").forEach(b =>
    b.addEventListener("click", () => {
      state.letter = b.dataset.letter === "" ? null : b.dataset.letter;
      renderLetters(); renderGrid();
    })
  );
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
}
function highlight(text, q) {
  const safe = escapeHtml(text);
  if (!q) return safe;
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
  return safe.replace(re, "<mark>$1</mark>");
}
function getFiltered() {
  const q = state.q.trim().toLowerCase();
  return items.filter(x => {
    if (state.cat !== "all" && x.cat !== state.cat) return false;
    if (state.letter && x.letter !== state.letter) return false;
    if (q && !(x.title.toLowerCase().includes(q) || x.src.includes(q))) return false;
    return true;
  });
}
function renderGrid() {
  const list = getFiltered();
  document.getElementById("resultCount").textContent = String(list.length).padStart(3, "0");
  const grid = document.getElementById("grid");
  if (list.length === 0) {
    grid.style.border = "none";
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <h3>Nothing here.</h3>
      <p>Try a different keyword, category, or letter.</p>
    </div>`;
    return;
  }
  grid.style.border = "";
  grid.innerHTML = list.map(x => `
    <a class="card" href="${x.url}" ${x.isDeepDive ? "" : "target=\"_blank\" rel=\"noopener\""}>
      <div class="card-head">
        <div class="tag">${CAT_LABEL[x.cat] || x.cat}<span class="dot">·</span>${x.letter === "#" ? "Misc" : x.letter}${x.isDeepDive ? '<span class="deep-badge">Deep dive</span>' : ""}</div>
        <div class="arr">${x.isDeepDive ? "→" : "↗"}</div>
      </div>
      <h3 class="card-title">${highlight(x.title, state.q.trim())}</h3>
      <div class="card-foot">
        <span>${x.isDeepDive ? "system design academy" : x.src}</span>
        <span class="num">№ ${String(x.i).padStart(3, "0")}</span>
      </div>
    </a>
  `).join("");
}

document.getElementById("q").addEventListener("input", e => {
  state.q = e.target.value;
  renderGrid();
});
document.getElementById("clear").addEventListener("click", () => {
  state = { cat: "all", letter: null, q: "" };
  document.getElementById("q").value = "";
  renderCats(); renderLetters(); renderGrid();
});
document.getElementById("random").addEventListener("click", () => {
  const list = getFiltered();
  const pool = list.length > 0 ? list : items;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  if (pick.isDeepDive) {
    window.location.href = pick.url;
  } else {
    window.open(pick.url, "_blank", "noopener");
  }
});

renderStats();
renderCats();
renderLetters();
renderGrid();
