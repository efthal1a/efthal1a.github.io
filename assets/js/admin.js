/* =========================================================
   admin.js — Πίνακας διαχείρισης της Λίας
   ========================================================= */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function toast(msg, err) {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "toast show" + (err ? " err" : "");
    clearTimeout(t._t);
    t._t = setTimeout(() => (t.className = "toast"), 3200);
  }
  function uid(prefix) {
    return prefix + "-" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  }
  async function fileToBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  // Ανεβάζει πολλές φωτογραφίες (αρχεία) + προαιρετικό σύνδεσμο από το ίντερνετ.
  // Επιστρέφει πίνακα με URLs/paths.
  async function collectImages(fileInput, urlInput, folder) {
    const out = [];
    const files = fileInput && fileInput.files ? Array.from(fileInput.files) : [];
    for (const file of files) {
      const b64 = await fileToBase64(file);
      const path = folder + uid("img") + "-" + file.name.replace(/[^a-z0-9._-]/gi, "");
      await GH.putBinary(path, b64, "φωτογραφία");
      out.push(path);
    }
    const url = urlInput && urlInput.value ? urlInput.value.trim() : "";
    if (url) out.push(url);
    return out;
  }

  /* ---------- Login (μόνο με κωδικό) ---------- */
  const loginView = $("#loginView");
  const appView = $("#appView");
  const AUTH_PATH = "data/auth.json"; // κρυπτογραφημένο token (AES) στο repo

  function showApp() {
    loginView.classList.add("hidden");
    appView.classList.remove("hidden");
    const c = GH.cfg();
    $("#whoLabel").textContent = c.owner + "/" + c.repo;
    loadAll();
  }

  // auto-detect owner/repo/branch από τη διεύθυνση (GitHub Pages)
  function detectRepo() {
    const h = location.hostname || "";
    let owner = "", repo = "";
    if (h.endsWith(".github.io")) {
      owner = h.split(".")[0];
      const seg = location.pathname.split("/").filter(Boolean);
      if (seg.length > 1) repo = seg[0]; // project page → /repo/admin.html
      else repo = owner + ".github.io";  // user page
    }
    return { owner, repo, branch: "main" };
  }

  // ----- Σύνδεση μόνο με κωδικό -----
  async function doLogin() {
    const pass = $("#inPass").value;
    if (!pass) { toast("Βάλε τον κωδικό σου", true); return; }
    $("#loginBtn").disabled = true;
    try {
      const res = await fetch(AUTH_PATH + "?t=" + Date.now());
      if (res.status === 404) {
        toast("Δεν έχει γίνει ρύθμιση ακόμα — πάτα «Ρύθμισε τη σύνδεση»", true);
        openSetup();
        return;
      }
      const cipher = await res.text();
      let payload;
      try {
        const plain = CryptoJS.AES.decrypt(cipher.trim(), pass).toString(CryptoJS.enc.Utf8);
        payload = JSON.parse(plain);
      } catch (_) { payload = null; }
      if (!payload || !payload.token) { toast("Λάθος κωδικός", true); return; }
      GH.saveCfg({ owner: payload.owner, repo: payload.repo, branch: payload.branch || "main", token: payload.token });
      try { await GH.whoami(); } catch (_) { GH.clearCfg(); toast("Το κλειδί έληξε — ξαναρύθμισε τη σύνδεση", true); return; }
      toast("Καλωσήρθες, Λία!");
      showApp();
    } catch (e) {
      toast("Σφάλμα σύνδεσης: " + e.message, true);
    } finally {
      $("#loginBtn").disabled = false;
    }
  }

  // ----- One-time setup -----
  async function doSetup() {
    const owner = $("#inOwner").value.trim();
    const repo = $("#inRepo").value.trim();
    const branch = $("#inBranch").value.trim() || "main";
    const token = $("#inToken").value.trim();
    const pass = $("#inSetupPass").value;
    if (!owner || !repo || !token || !pass) { toast("Συμπλήρωσε όλα τα πεδία", true); return; }
    $("#setupBtn").disabled = true;
    try {
      GH.saveCfg({ owner, repo, branch, token });
      await GH.whoami(); // επαλήθευση κλειδιού
      const payload = JSON.stringify({ token, owner, repo, branch });
      const cipher = CryptoJS.AES.encrypt(payload, pass).toString();
      await GH.putFile(AUTH_PATH, cipher, "ρύθμιση κρυπτογραφημένης σύνδεσης");
      toast("Έτοιμο! Από εδώ και πέρα μπαίνεις μόνο με τον κωδικό.");
      showApp();
    } catch (e) {
      GH.clearCfg();
      toast("Λάθος κλειδί ή δικαιώματα", true);
    } finally {
      $("#setupBtn").disabled = false;
    }
  }

  function openSetup() {
    const d = detectRepo();
    if (d.owner && !$("#inOwner").value) $("#inOwner").value = d.owner;
    if (d.repo && !$("#inRepo").value) $("#inRepo").value = d.repo;
    $("#pwLogin").classList.add("hidden");
    $("#setupBox").classList.remove("hidden");
  }
  function closeSetup() {
    $("#setupBox").classList.add("hidden");
    $("#pwLogin").classList.remove("hidden");
  }

  $("#loginBtn").addEventListener("click", doLogin);
  $("#inPass").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
  $("#setupBtn").addEventListener("click", doSetup);
  $("#showSetup").addEventListener("click", (e) => { e.preventDefault(); openSetup(); });
  $("#hideSetup").addEventListener("click", (e) => { e.preventDefault(); closeSetup(); });
  $("#logoutBtn").addEventListener("click", () => { GH.clearCfg(); location.reload(); });

  // αν υπάρχει ήδη ενεργή σύνδεση στη συσκευή, μπες κατευθείαν
  (function prefill() {
    const c = GH.cfg();
    if (c && c.token) { GH.whoami().then(showApp).catch(() => GH.clearCfg()); }
  })();

  /* ---------- Tabs ---------- */
  $$(".tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      $$(".tabs button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      $$("[data-panel]").forEach((p) => p.classList.add("hidden"));
      $("[data-panel='" + b.dataset.tab + "']").classList.remove("hidden");
    })
  );

  /* ---------- State ---------- */
  let posts = [], projects = [], templates = [];

  async function loadAll() {
    try {
      [posts, projects, templates] = await Promise.all([
        GH.getJSON("data/posts.json"),
        GH.getJSON("data/projects.json"),
        GH.getJSON("data/templates.json")
      ]);
      renderPostList();
      renderProjectList();
      renderTplList();
    } catch (e) {
      toast("Σφάλμα φόρτωσης δεδομένων", true);
    }
  }

  /* ---------- POSTS ---------- */
  $("#postForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#postBtn"); btn.disabled = true;
    try {
      const images = await collectImages($("#postImg"), $("#postImgUrl"), "assets/img/notes/uploads/");
      const p = {
        id: uid("post"),
        date: $("#postDate").value || new Date().toISOString().slice(0, 10),
        tag_el: $("#postTagEl").value, tag_en: $("#postTagEn").value || $("#postTagEl").value,
        title_el: $("#postTitleEl").value, title_en: $("#postTitleEn").value || $("#postTitleEl").value,
        body_el: $("#postBodyEl").value, body_en: $("#postBodyEn").value || $("#postBodyEl").value,
        img: images[0] || "", images: images
      };
      if (!p.title_el || !p.body_el) { toast("Τίτλος και κείμενο απαραίτητα", true); btn.disabled = false; return; }
      posts.unshift(p);
      await save("data/posts.json", posts, "νέα ιδέα: " + p.title_el, () => {
        e.target.reset(); renderPostList(); toast("Η ιδέα δημοσιεύτηκε!");
      });
    } catch (err) {
      toast("Σφάλμα: " + err.message, true);
    } finally { btn.disabled = false; }
  });
  function renderPostList() {
    $("#postList").innerHTML = posts.map((p) =>
      `<div class="list-item"><div><strong>${esc(p.title_el)}</strong><br><small>${p.date} · ${esc(p.tag_el || "")}</small></div>
       <button class="chip-del" data-del-post="${p.id}">Διαγραφή</button></div>`).join("") || emptyRow();
    $$("[data-del-post]").forEach((b) => b.addEventListener("click", async () => {
      posts = posts.filter((x) => x.id !== b.dataset.delPost);
      await save("data/posts.json", posts, "διαγραφή ιδέας", () => { renderPostList(); toast("Διαγράφηκε"); });
    }));
  }

  /* ---------- PROJECTS ---------- */
  $("#projForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#projBtn"); btn.disabled = true;
    try {
      const images = await collectImages($("#projImg"), $("#projImgUrl"), "assets/img/uploads/");
      const pr = {
        id: uid("p"),
        cat: $("#projCat").value,
        title_el: $("#projTitleEl").value, title_en: $("#projTitleEn").value || $("#projTitleEl").value,
        desc_el: $("#projDescEl").value, desc_en: $("#projDescEn").value || $("#projDescEl").value,
        img: images[0] || "", images: images, wide: $("#projWide").checked
      };
      if (!pr.title_el) { toast("Τίτλος απαραίτητος", true); btn.disabled = false; return; }
      projects.unshift(pr);
      await save("data/projects.json", projects, "νέο έργο: " + pr.title_el, () => {
        e.target.reset(); renderProjectList(); toast("Το έργο προστέθηκε!");
      });
    } catch (err) {
      toast("Σφάλμα: " + err.message, true);
    } finally { btn.disabled = false; }
  });
  function renderProjectList() {
    $("#projList").innerHTML = projects.map((p) =>
      `<div class="list-item"><div><strong>${esc(p.title_el)}</strong><br><small>${esc(p.cat)}${p.img ? " · με εικόνα" : ""}</small></div>
       <button class="chip-del" data-del-proj="${p.id}">Διαγραφή</button></div>`).join("") || emptyRow();
    $$("[data-del-proj]").forEach((b) => b.addEventListener("click", async () => {
      projects = projects.filter((x) => x.id !== b.dataset.delProj);
      await save("data/projects.json", projects, "διαγραφή έργου", () => { renderProjectList(); toast("Διαγράφηκε"); });
    }));
  }

  /* ---------- TEMPLATES (encrypted files) ---------- */
  function fillTplSelect() {
    const opts = templates.map((t) => `<option value="${t.id}">${esc(t.title_el)}</option>`).join("");
    $("#tplSelect").innerHTML = opts;
    if ($("#tplMetaSelect")) $("#tplMetaSelect").innerHTML = opts;
  }

  // update inspiration image + story (public)
  $("#tplMetaForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#tplMetaBtn"); btn.disabled = true;
    try {
      const tpl = templates.find((t) => t.id === $("#tplMetaSelect").value);
      if (!tpl) { btn.disabled = false; return; }
      const file = $("#tplMetaImg").files[0];
      if (file) {
        const b64 = await fileToBase64(file);
        const path = "assets/img/templates/uploads/" + uid("insp") + "-" + file.name.replace(/[^a-z0-9._-]/gi, "");
        await GH.putBinary(path, b64, "εικόνα έμπνευσης template");
        tpl.img = path;
      }
      if ($("#tplStoryEl").value.trim()) tpl.story_el = $("#tplStoryEl").value.trim();
      if ($("#tplStoryEn").value.trim()) tpl.story_en = $("#tplStoryEn").value.trim();
      await save("data/templates.json", templates, "ενημέρωση έμπνευσης/ιστορίας", () => {
        e.target.reset(); renderTplList(); toast("Ενημερώθηκε!");
      });
    } catch (err) {
      toast("Σφάλμα: " + err.message, true);
    } finally { btn.disabled = false; }
  });
  $("#tplFileForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#tplBtn"); btn.disabled = true;
    try {
      const tplId = $("#tplSelect").value;
      const file = $("#tplFile").files[0];
      const pass = $("#tplPass").value;
      if (!file || !pass) { toast("Αρχείο και κωδικός απαραίτητα", true); btn.disabled = false; return; }
      const b64 = await fileToBase64(file);
      // Encrypt base64 payload with AES (CryptoJS)
      const cipher = CryptoJS.AES.encrypt(b64, pass).toString();
      const path = "data/templates/" + tplId + "/" + uid("f") + ".enc";
      await GH.putFile(path, cipher, "κρυπτογραφημένο αρχείο template");
      const tpl = templates.find((t) => t.id === tplId);
      tpl.files = tpl.files || [];
      tpl.files.push({ id: uid("file"), name: file.name, path: path, size: file.size, added: new Date().toISOString().slice(0, 10) });
      await save("data/templates.json", templates, "νέο αρχείο σε template", () => {
        e.target.reset(); renderTplList(); toast("Το αρχείο ανέβηκε κρυπτογραφημένο!");
      });
    } catch (err) {
      toast("Σφάλμα: " + err.message, true);
    } finally { btn.disabled = false; }
  });
  function renderTplList() {
    fillTplSelect();
    $("#tplList").innerHTML = templates.map((t) => {
      const files = (t.files || []).map((f) =>
        `<div class="list-item"><small>📄 ${esc(f.name)} <em>(${(f.size / 1024 | 0)} KB)</em></small>
         <button class="chip-del" data-del-file="${t.id}::${f.id}">Διαγραφή</button></div>`).join("") ||
        `<small style="color:var(--ink-soft)">— κανένα αρχείο ακόμα —</small>`;
      return `<div style="margin-bottom:1.4rem"><strong>${esc(t.title_el)}</strong>${files}</div>`;
    }).join("");
    $$("[data-del-file]").forEach((b) => b.addEventListener("click", async () => {
      const [tid, fid] = b.dataset.delFile.split("::");
      const tpl = templates.find((t) => t.id === tid);
      tpl.files = (tpl.files || []).filter((f) => f.id !== fid);
      await save("data/templates.json", templates, "διαγραφή αρχείου template", () => { renderTplList(); toast("Διαγράφηκε"); });
    }));
  }

  /* ---------- save helper ---------- */
  async function save(path, obj, msg, cb) {
    try {
      await GH.putJSON(path, obj, msg);
      cb && cb();
    } catch (e) {
      toast("Αποτυχία αποθήκευσης: " + e.message, true);
    }
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function emptyRow() { return `<small style="color:var(--ink-soft)">— κενό —</small>`; }
})();
