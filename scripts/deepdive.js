// ─────────────────────────────────────────────────────────────────────────
// Deep-dive page utilities — tabs, copy buttons, smooth nav
// ─────────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  // Tabs
  document.querySelectorAll(".tabs").forEach(group => {
    const tabs = group.querySelectorAll(".tab");
    const panels = group.parentElement.querySelectorAll(":scope > .tab-panel");
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => {
        tabs.forEach(x => x.classList.remove("active"));
        panels.forEach(p => p.classList.remove("active"));
        t.classList.add("active");
        panels[i].classList.add("active");
      });
    });
  });

  // Copy code buttons (auto-inject)
  document.querySelectorAll(".code").forEach(block => {
    const head = block.querySelector(".head");
    if (!head) return;
    const right = head.querySelector(".dots");
    if (!right) return;
    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.textContent = "copy";
    btn.style.cssText =
      "background:none;border:1px solid #3a342a;color:#8a8478;font-family:inherit;font-size:10px;text-transform:uppercase;letter-spacing:0.14em;padding:3px 8px;cursor:pointer;margin-left:10px;transition:all 0.15s;";
    btn.addEventListener("mouseenter", () => { btn.style.color = "#e8b298"; btn.style.borderColor = "#e8b298"; });
    btn.addEventListener("mouseleave", () => { btn.style.color = "#8a8478"; btn.style.borderColor = "#3a342a"; });
    btn.addEventListener("click", async () => {
      const pre = block.querySelector("pre");
      if (!pre) return;
      const text = pre.innerText.replace(/^\s*\d+\s/gm, "");
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "copied";
        setTimeout(() => (btn.textContent = "copy"), 1400);
      } catch {
        btn.textContent = "err";
      }
    });
    right.appendChild(btn);
  });

  // TOC active section tracking
  const toc = document.querySelector(".toc");
  if (toc) {
    const links = toc.querySelectorAll("a");
    const sections = [...links].map(a => document.querySelector(a.getAttribute("href"))).filter(Boolean);
    const onScroll = () => {
      let active = sections[0];
      const y = window.scrollY + 120;
      for (const s of sections) {
        if (s.offsetTop <= y) active = s;
      }
      links.forEach(l => l.classList.toggle("active", l.getAttribute("href") === `#${active.id}`));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
});
