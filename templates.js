/* =========================================================
   templates.js — Ιδιωτική βιβλιοθήκη templates
   Οι ιστορίες είναι δημόσιες· τα αρχεία ξεκλειδώνουν
   μόνο με τον κωδικό της Λίας (AES στον browser).
   ========================================================= */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  let lang = localStorage.getItem("lia_lang") || "el";
  let templates = [];
  let unlockPass = null;

  function toast(msg, err) {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "toast show" + (err ? " err" : "");
    clearTimeout(t._t);
    t._t = setTimeout(() => (t.className = "toast"), 3200);
  }
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const L = {
    el: { unlock: "Ξεκλείδωμα", locked: "🔒 Κλειδωμένο σχέδιο", download: "Κατέβασμα", nofiles: "🔒 Τα αρχεία σχεδίων είναι κλειδωμένα",
      pass: "Κωδικός για ξεκλείδωμα των αρχείων", unlocked: "Ξεκλειδώθηκε — μπορείς να κατεβάσεις τα αρχεία σου",
      wrong: "Λάθος κωδικός για αυτό το αρχείο", downloading: "Αποκρυπτογράφηση…", story: "Η ιστορία του", files: "Αρχεία σχεδίων" },
    en: { unlock: "Unlock", locked: "🔒 Locked design", download: "Download", nofiles: "🔒 Design files are locked",
      pass: "Password to unlock the files", unlocked: "Unlocked — you can download your files",
      wrong: "Wrong password for this file", downloading: "Decrypting…", story: "Its story", files: "Design files" }
  };
  const tt = (k) => (L[lang] && L[lang][k]) || k;

  async function load() {
    try {
      const r = await fetch("data/templates.json?t=" + Date.now());
      templates = await r.json();
    } catch (e) { templates = []; }
    render();
  }

  function render() {
    const grid = $("#tplGrid");
    grid.innerHTML = templates.map((t) => {
      const era = lang === "el" ? t.era_el : t.era_en;
      const title = lang === "el" ? t.title_el : t.title_en;
      const story = lang === "el" ? t.story_el : t.story_en;
      const files = (t.files && t.files.length)
        ? t.files.map((f) => fileRow(f)).join("")
        : `<div class="tpl-file locked">${tt("nofiles")}</div>`;
      const figure = t.img
        ? `<div class="tpl-figure"><img src="${esc(t.img)}" alt="${esc(title)}" loading="lazy" /></div>`
        : "";
      return `<article class="tpl-card reveal">
        ${figure}
        <div class="tpl-head"><span class="era">${esc(era)}</span><h3>${esc(title)}</h3></div>
        <div class="tpl-body">
          <h4>${tt("story")}</h4>
          <p>${esc(story)}</p>
          <div class="files"><h4 style="margin-top:1rem">${tt("files")}</h4>${files}</div>
        </div>
      </article>`;
    }).join("");
    bindDownloads();
    $$(".reveal").forEach((el) => el.classList.add("in"));
  }

  function fileRow(f) {
    if (unlockPass) {
      return `<div class="tpl-file"><span>📄 ${esc(f.name)}</span>
        <a href="#" data-dl='${esc(f.path)}' data-name='${esc(f.name)}'>${tt("download")} ↓</a></div>`;
    }
    return `<div class="tpl-file locked"><span>📄 ${esc(f.name)}</span><span>${tt("locked")}</span></div>`;
  }

  function bindDownloads() {
    $$("[data-dl]").forEach((a) => a.addEventListener("click", async (e) => {
      e.preventDefault();
      const path = a.getAttribute("data-dl");
      const name = a.getAttribute("data-name");
      a.textContent = tt("downloading");
      try {
        const r = await fetch(path + "?t=" + Date.now());
        const cipher = await r.text();
        const bytes = CryptoJS.AES.decrypt(cipher, unlockPass);
        const b64 = bytes.toString(CryptoJS.enc.Utf8);
        if (!b64) throw new Error("wrong");
        downloadBase64(b64, name);
        a.textContent = tt("download") + " ↓";
      } catch (err) {
        toast(tt("wrong"), true);
        a.textContent = tt("download") + " ↓";
      }
    }));
  }

  function downloadBase64(b64, filename) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const blob = new Blob([arr]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* unlock */
  $("#unlockBtn").addEventListener("click", () => {
    const p = $("#unlockPass").value;
    if (!p) { toast(tt("wrong"), true); return; }
    unlockPass = p;
    $("#unlockRow").classList.add("hidden");
    $("#unlockedNote").classList.remove("hidden");
    render();
    toast(tt("unlocked"));
  });
  $("#unlockPass").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#unlockBtn").click(); });

  /* lang toggle */
  $$(".lang-toggle button").forEach((b) => b.addEventListener("click", () => {
    lang = b.dataset.lang; localStorage.setItem("lia_lang", lang);
    $$(".lang-toggle button").forEach((x) => x.classList.toggle("active", x.dataset.lang === lang));
    $("#unlockPass").placeholder = tt("pass");
    $("#unlockBtn").textContent = tt("unlock");
    render();
  }));

  // init labels
  $$(".lang-toggle button").forEach((x) => x.classList.toggle("active", x.dataset.lang === lang));
  $("#unlockPass").placeholder = tt("pass");
  $("#unlockBtn").textContent = tt("unlock");
  load();
})();
