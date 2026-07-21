/* =========================================================
   admin.js — Πίνακας διαχείρισης
   ========================================================= */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const AUTH_PATH = "data/auth.json";
  const SITE_PATH = "data/site.json";

  /* ---------- helpers ---------- */
  function toast(msg, err) {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "toast show" + (err ? " err" : "");
    clearTimeout(t._t);
    t._t = setTimeout(() => (t.className = "toast"), 3600);
  }
  function uid(p) {
    return p + "-" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function fileToBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }
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

  /* ---------- crypto (WebCrypto: PBKDF2-SHA256 + AES-GCM) ----------
     CryptoJS's passphrase mode derives keys with one round of MD5, which makes the
     published ciphertext trivial to attack offline. PBKDF2 at 310k rounds raises the
     cost per guess by ~5-6 orders of magnitude. It does NOT rescue a weak password. */
  const ITERATIONS = 310000;
  const encU = new TextEncoder();
  const decU = new TextDecoder();
  const B64 = {
    enc: (buf) => btoa(String.fromCharCode.apply(null, new Uint8Array(buf))),
    dec: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
  };

  async function deriveKey(pass, salt) {
    const base = await crypto.subtle.importKey("raw", encU.encode(pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: ITERATIONS, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function seal(obj, pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pass, salt);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, encU.encode(JSON.stringify(obj)));
    return JSON.stringify({
      v: 2, kdf: "PBKDF2-SHA256", iterations: ITERATIONS,
      salt: B64.enc(salt), iv: B64.enc(iv), ct: B64.enc(ct)
    }, null, 2);
  }
  async function unseal(text, pass) {
    const raw = String(text).trim();
    if (raw.startsWith("{")) {
      const j = JSON.parse(raw);
      const key = await deriveKey(pass, B64.dec(j.salt));
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: B64.dec(j.iv) }, key, B64.dec(j.ct));
      return JSON.parse(decU.decode(pt));
    }
    // legacy CryptoJS blob from the previous setup flow
    return JSON.parse(CryptoJS.AES.decrypt(raw, pass).toString(CryptoJS.enc.Utf8));
  }

  /* ---------- auth ---------- */
  const loginView = $("#loginView"), appView = $("#appView");

  function detectRepo() {
    const h = location.hostname || "";
    if (!h.endsWith(".github.io")) return { owner: "", repo: "", branch: "main" };
    const owner = h.split(".")[0];
    const seg = location.pathname.split("/").filter(Boolean);
    return { owner: owner, repo: seg.length > 1 ? seg[0] : owner + ".github.io", branch: "main" };
  }

  function showApp() {
    loginView.classList.add("hidden");
    appView.classList.remove("hidden");
    const c = GH.cfg();
    $("#whoLabel").textContent = c.owner + "/" + c.repo;
    loadAll();
  }

  async function doLogin() {
    const pass = $("#inPass").value;
    if (!pass) { toast("Βάλε τον κωδικό σου", true); return; }
    const btn = $("#loginBtn");
    btn.disabled = true; btn.textContent = "Έλεγχος…";
    try {
      const res = await fetch(AUTH_PATH + "?t=" + Date.now());
      if (res.status === 404) {
        toast("Δεν έχει γίνει ρύθμιση ακόμα", true);
        openSetup();
        return;
      }
      let payload = null;
      try { payload = await unseal(await res.text(), pass); } catch (_) { payload = null; }
      if (!payload || !payload.token) { toast("Λάθος κωδικός", true); return; }
      GH.saveCfg({ owner: payload.owner, repo: payload.repo, branch: payload.branch || "main", token: payload.token });
      try { await GH.whoami(); }
      catch (_) { GH.clearCfg(); toast("Το token έληξε — ξαναρύθμισε τη σύνδεση", true); return; }
      showApp();
    } catch (e) {
      toast("Σφάλμα: " + e.message, true);
    } finally {
      btn.disabled = false; btn.textContent = "Σύνδεση";
    }
  }

  async function doSetup() {
    const owner = $("#inOwner").value.trim(), repo = $("#inRepo").value.trim();
    const branch = $("#inBranch").value.trim() || "main";
    const token = $("#inToken").value.trim(), pass = $("#inSetupPass").value;
    if (!owner || !repo || !token || !pass) { toast("Συμπλήρωσε όλα τα πεδία", true); return; }
    if (pass.length < 12) { toast("Ο κωδικός θέλει τουλάχιστον 12 χαρακτήρες", true); return; }
    const btn = $("#setupBtn");
    btn.disabled = true; btn.textContent = "Αποθήκευση…";
    try {
      GH.saveCfg({ owner: owner, repo: repo, branch: branch, token: token });
      await GH.whoami();
      await GH.putFile(AUTH_PATH, await seal({ token: token, owner: owner, repo: repo, branch: branch }, pass),
                       "ρύθμιση σύνδεσης");
      toast("Έτοιμο! Από εδώ και πέρα μόνο με τον κωδικό.");
      showApp();
    } catch (e) {
      GH.clearCfg();
      toast("Λάθος token ή δικαιώματα", true);
    } finally {
      btn.disabled = false; btn.textContent = "Αποθήκευση";
    }
  }

  function openSetup() {
    const d = detectRepo();
    if (d.owner && !$("#inOwner").value) $("#inOwner").value = d.owner;
    if (d.repo && !$("#inRepo").value) $("#inRepo").value = d.repo;
    $("#pwLogin").classList.add("hidden");
    $("#setupBox").classList.remove("hidden");
  }

  $("#loginBtn").addEventListener("click", doLogin);
  $("#inPass").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
  $("#setupBtn").addEventListener("click", doSetup);
  $("#showSetup").addEventListener("click", (e) => { e.preventDefault(); openSetup(); });
  $("#hideSetup").addEventListener("click", (e) => {
    e.preventDefault();
    $("#setupBox").classList.add("hidden");
    $("#pwLogin").classList.remove("hidden");
  });
  $("#logoutBtn").addEventListener("click", () => { GH.clearCfg(); location.reload(); });

  (function resume() {
    const c = GH.cfg();
    if (c && c.token) GH.whoami().then(showApp).catch(() => GH.clearCfg());
  })();

  /* ---------- tabs ---------- */
  $$(".seg button").forEach((b) =>
    b.addEventListener("click", () => {
      $$(".seg button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      $$("[data-panel]").forEach((p) => p.classList.add("hidden"));
      $("[data-panel='" + b.dataset.tab + "']").classList.remove("hidden");
    })
  );

  /* ---------- state ---------- */
  let posts = [], projects = [], templates = [], site = {};

  async function loadAll() {
    try {
      const [a, b, c, s] = await Promise.all([
        GH.getJSON("data/posts.json"),
        GH.getJSON("data/projects.json"),
        GH.getJSON("data/templates.json"),
        GH.getFile(SITE_PATH).catch(() => ({ exists: false }))
      ]);
      posts = a; projects = b; templates = c;
      site = s.exists && s.content ? safeParse(s.content) : {};
      renderPostList(); renderProjectList(); renderTplList();
      buildTextEditor(); buildColorEditor(); fillLookForm();
    } catch (e) {
      toast("Σφάλμα φόρτωσης: " + e.message, true);
    }
  }
  function safeParse(s) { try { return JSON.parse(s); } catch (_) { return {}; } }

  async function save(path, obj, msg, cb) {
    try { await GH.putJSON(path, obj, msg); cb && cb(); }
    catch (e) { toast("Αποτυχία αποθήκευσης: " + e.message, true); }
  }

  /* =========================================================
     ΚΕΙΜΕΝΑ
     ========================================================= */
  const GROUP_LABELS = {
    nav: "Μενού", hero: "Κορυφή", sc: "Λεζάντες φωτογραφιών", scroll: "Λοιπά",
    about: "Προφίλ", work: "Εμπνεύσεις", ideas: "Σημειώσεις", tpl: "Templates",
    contact: "Επικοινωνία", footer: "Υποσέλιδο", credits: "Πηγές φωτογραφιών"
  };

  // Raw keys mean nothing to whoever edits the site — show plain descriptions instead.
  const FIELD_LABELS = {
    "nav.about": "Μενού: Προφίλ", "nav.work": "Μενού: Εμπνεύσεις", "nav.ideas": "Μενού: Σημειώσεις",
    "nav.templates": "Μενού: Templates", "nav.contact": "Μενού: Επικοινωνία",

    "hero.eyebrow": "Μικρή γραμμή πάνω από τον τίτλο",
    "hero.title1": "Τίτλος — πρώτη γραμμή", "hero.title2": "Τίτλος — δεύτερη γραμμή (πλάγια)",
    "hero.sub": "Υπότιτλος", "hero.designs": "Φράση: πρώτη λέξη (π.χ. «Σχεδιάζει»)",
    "hero.rotor": "Λέξεις που εναλλάσσονται — χώρισέ τες με |",
    "hero.that": "Φράση: κατάληξη",
    "hero.chip1": "Ετικέτα 1", "hero.chip2": "Ετικέτα 2", "hero.chip3": "Ετικέτα 3", "hero.chip4": "Ετικέτα 4",
    "hero.marquee": "Κυλιόμενη μπάρα στο κάτω μέρος",
    "hero.cta1": "Κουμπί 1", "hero.cta2": "Κουμπί 2", "scroll": "Ένδειξη κύλισης",
    "sc1": "Λεζάντα φωτογραφίας 1", "sc2": "Λεζάντα φωτογραφίας 2", "sc3": "Λεζάντα φωτογραφίας 3",
    "sc4": "Λεζάντα φωτογραφίας 4", "sc5": "Λεζάντα φωτογραφίας 5",

    "about.eyebrow": "Μικρή γραμμή", "about.title": "Ονοματεπώνυμο", "about.tag": "Ετικέτα κάτω από τη φωτογραφία",
    "about.p1": "Παράγραφος 1", "about.p2": "Παράγραφος 2",
    "about.f1n": "Στοιχείο 1 — τίτλος", "about.f1l": "Στοιχείο 1 — περιγραφή",
    "about.f2n": "Στοιχείο 2 — τίτλος", "about.f2l": "Στοιχείο 2 — περιγραφή",
    "about.f3n": "Στοιχείο 3 — τίτλος", "about.f3l": "Στοιχείο 3 — περιγραφή",
    "about.f4n": "Στοιχείο 4 — τίτλος", "about.f4l": "Στοιχείο 4 — περιγραφή",
    "about.tl": "Τίτλος πορείας",
    "about.tl1t": "Πορεία 1 — θέση", "about.tl1d": "Πορεία 1 — περιγραφή",
    "about.tl2t": "Πορεία 2 — θέση", "about.tl2d": "Πορεία 2 — περιγραφή",
    "about.tl3t": "Πορεία 3 — θέση", "about.tl3d": "Πορεία 3 — περιγραφή",

    "work.eyebrow": "Μικρή γραμμή", "work.title": "Τίτλος ενότητας", "work.sub": "Περιγραφή ενότητας",
    "work.f.all": "Φίλτρο: Όλα", "work.f.landscape": "Φίλτρο: Τοπίο",
    "work.f.plants": "Φίλτρο: Φυτά", "work.f.craft": "Φίλτρο: Τεχνική",

    "ideas.eyebrow": "Μικρή γραμμή", "ideas.title": "Τίτλος ενότητας",
    "ideas.sub": "Περιγραφή ενότητας", "ideas.empty": "Μήνυμα όταν δεν υπάρχουν σημειώσεις",

    "tpl.lock": "Ένδειξη ιδιωτικού", "tpl.title": "Τίτλος ενότητας",
    "tpl.sub": "Περιγραφή ενότητας", "tpl.cta": "Κουμπί εισόδου",

    "contact.eyebrow": "Μικρή γραμμή", "contact.title": "Τίτλος ενότητας", "contact.sub": "Εισαγωγικό κείμενο",
    "contact.name": "Πεδίο: Όνομα", "contact.email": "Πεδίο: Email", "contact.subject": "Πεδίο: Θέμα",
    "contact.msg": "Πεδίο: Μήνυμα", "contact.send": "Κουμπί αποστολής", "contact.note": "Σημείωση κάτω από τη φόρμα",
    "contact.sending": "Μήνυμα: αποστέλλεται", "contact.ok": "Μήνυμα: επιτυχία", "contact.err": "Μήνυμα: σφάλμα",

    "footer.tag": "Υποσέλιδο: περιγραφή", "footer.rights": "Υποσέλιδο: δικαιώματα",
    "footer.admin": "Υποσέλιδο: σύνδεσμος διαχείρισης",
    "credits.title": "Πηγές: τίτλος", "credits.note": "Πηγές: επεξήγηση"
  };

  function currentLang() { return $("#textLang").value || "el"; }
  function defaults(l) { return (window.I18N && window.I18N[l]) || {}; }
  function overrides(l) { return ((site.text || {})[l]) || {}; }

  function buildTextEditor() {
    const l = currentLang();
    const def = defaults(l), ov = overrides(l);
    const groups = {};
    Object.keys(def).forEach((k) => {
      const g = k.split(".")[0].replace(/[0-9]+$/, "");
      (groups[g] = groups[g] || []).push(k);
    });

    $("#textFields").innerHTML = Object.keys(groups).map((g) => {
      const rows = groups[g].map((k) => {
        const val = ov[k] != null ? ov[k] : def[k];
        const long = String(def[k] || "").length > 70;
        const ctrl = long
          ? `<textarea data-key="${esc(k)}">${esc(val)}</textarea>`
          : `<input data-key="${esc(k)}" value="${esc(val)}" />`;
        return `<div class="field"><label>${esc(FIELD_LABELS[k] || k)}</label>${ctrl}</div>`;
      }).join("");
      return `<h3>${esc(GROUP_LABELS[g] || g)}</h3><div class="grid grid-2">${rows}</div>`;
    }).join("");
  }

  $("#textLang").addEventListener("change", buildTextEditor);

  $("#textSaveBtn").addEventListener("click", async () => {
    const l = currentLang(), def = defaults(l);
    const btn = $("#textSaveBtn");
    btn.disabled = true; btn.textContent = "Αποθήκευση…";
    const out = {};
    $$("#textFields [data-key]").forEach((el) => {
      const k = el.dataset.key, v = el.value;
      // store only genuine changes, so the file stays small and defaults keep flowing through
      if (v.trim() && v !== def[k]) out[k] = v;
    });
    site.text = site.text || {};
    site.text[l] = out;
    await save(SITE_PATH, site, "ενημέρωση κειμένων (" + l + ")", () => {
      toast("Τα κείμενα αποθηκεύτηκαν — δες τη σελίδα σε λίγο");
    });
    btn.disabled = false; btn.textContent = "Αποθήκευση κειμένων";
  });

  /* =========================================================
     ΕΜΦΑΝΙΣΗ
     ========================================================= */
  const COLORS = [
    { k: "--olive-900", label: "Σκούρο φόντο (κορυφή, υποσέλιδο)", def: "#1f2a1c" },
    { k: "--olive-800", label: "Σκούρο δευτερεύον", def: "#2c3a26" },
    { k: "--lime-oil",  label: "Τόνος έμφασης", def: "#b5c98a" },
    { k: "--terra-500", label: "Δεύτερος τόνος", def: "#c26a41" },
    { k: "--chalk",     label: "Ανοιχτό φόντο", def: "#f7f4ec" },
    { k: "--ink",       label: "Χρώμα κειμένου", def: "#23281f" }
  ];

  function buildColorEditor() {
    const th = site.theme || {};
    $("#colorFields").innerHTML = COLORS.map((c) => {
      const v = th[c.k] || c.def;
      return `<div class="field"><label>${esc(c.label)}</label>
        <div class="swatch-row">
          <input type="color" data-color="${esc(c.k)}" value="${esc(v)}" />
          <input type="text" data-hex="${esc(c.k)}" value="${esc(th[c.k] || "")}" placeholder="${esc(c.def)}" />
        </div></div>`;
    }).join("");
    // keep the picker and the hex box in step
    $$("[data-color]").forEach((p) =>
      p.addEventListener("input", () => { $(`[data-hex="${p.dataset.color}"]`).value = p.value; }));
    $$("[data-hex]").forEach((t) =>
      t.addEventListener("input", () => {
        if (/^#[0-9a-f]{6}$/i.test(t.value)) $(`[data-color="${t.dataset.hex}"]`).value = t.value;
      }));
  }

  function fillLookForm() {
    const h = site.hero || {};
    $("#heroImgUrl").value = h.image || "";
    $("#heroOpacity").value = h.opacity || "";
  }

  $("#lookSaveBtn").addEventListener("click", async () => {
    const btn = $("#lookSaveBtn");
    btn.disabled = true; btn.textContent = "Αποθήκευση…";
    try {
      const theme = {};
      $$("[data-hex]").forEach((t) => { if (t.value.trim()) theme[t.dataset.hex] = t.value.trim(); });
      site.theme = theme;

      let img = $("#heroImgUrl").value.trim();
      const f = $("#heroImgFile").files[0];
      if (f) {
        const b64 = await fileToBase64(f);
        img = "assets/img/uploads/" + uid("hero") + "-" + f.name.replace(/[^a-z0-9._-]/gi, "");
        await GH.putBinary(img, b64, "φόντο κορυφής");
      }
      site.hero = { image: img, opacity: $("#heroOpacity").value.trim() || "0.32" };

      await save(SITE_PATH, site, "ενημέρωση εμφάνισης", () => {
        $("#heroImgFile").value = "";
        fillLookForm();
        toast("Η εμφάνιση αποθηκεύτηκε");
      });
    } catch (e) {
      toast("Σφάλμα: " + e.message, true);
    } finally {
      btn.disabled = false; btn.textContent = "Αποθήκευση εμφάνισης";
    }
  });

  $("#lookResetBtn").addEventListener("click", async () => {
    if (!confirm("Επαναφορά όλων των χρωμάτων και του φόντου στις προεπιλογές;")) return;
    site.theme = {}; site.hero = { image: "", opacity: "0.32" };
    await save(SITE_PATH, site, "επαναφορά εμφάνισης", () => {
      buildColorEditor(); fillLookForm(); toast("Έγινε επαναφορά");
    });
  });

  /* =========================================================
     ΣΗΜΕΙΩΣΕΙΣ
     ========================================================= */
  $("#postForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#postBtn"); btn.disabled = true;
    try {
      const images = await collectImages($("#postImg"), $("#postImgUrl"), "assets/img/uploads/");
      const p = {
        id: uid("post"),
        date: $("#postDate").value || new Date().toISOString().slice(0, 10),
        tag_el: $("#postTagEl").value, tag_en: $("#postTagEn").value || $("#postTagEl").value,
        title_el: $("#postTitleEl").value, title_en: $("#postTitleEn").value || $("#postTitleEl").value,
        body_el: $("#postBodyEl").value, body_en: $("#postBodyEn").value || $("#postBodyEl").value,
        img: images[0] || "", images: images
      };
      if (!p.title_el || !p.body_el) { toast("Τίτλος και κείμενο απαραίτητα", true); return; }
      posts.unshift(p);
      await save("data/posts.json", posts, "νέα σημείωση: " + p.title_el, () => {
        e.target.reset(); renderPostList(); toast("Δημοσιεύτηκε!");
      });
    } catch (err) { toast("Σφάλμα: " + err.message, true); }
    finally { btn.disabled = false; }
  });

  function renderPostList() {
    $("#postList").innerHTML = posts.map((p) =>
      `<div class="row-item"><div class="row-main">
        ${p.img ? `<img class="row-thumb" src="${esc(p.img)}" alt="">` : `<div class="row-thumb"></div>`}
        <div><strong>${esc(p.title_el)}</strong><small>${esc(p.date)} · ${esc(p.tag_el || "")}</small></div>
       </div><button class="del" data-del-post="${esc(p.id)}">Διαγραφή</button></div>`
    ).join("") || `<div class="empty">— καμία σημείωση —</div>`;
    $$("[data-del-post]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Διαγραφή αυτής της σημείωσης;")) return;
      posts = posts.filter((x) => x.id !== b.dataset.delPost);
      await save("data/posts.json", posts, "διαγραφή σημείωσης", () => { renderPostList(); toast("Διαγράφηκε"); });
    }));
  }

  /* =========================================================
     ΕΜΠΝΕΥΣΕΙΣ
     ========================================================= */
  $("#projForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#projBtn"); btn.disabled = true;
    try {
      const images = await collectImages($("#projImg"), $("#projImgUrl"), "assets/img/uploads/");
      const pr = {
        id: uid("insp"), cat: $("#projCat").value,
        title_el: $("#projTitleEl").value, title_en: $("#projTitleEn").value || $("#projTitleEl").value,
        desc_el: $("#projDescEl").value, desc_en: $("#projDescEn").value || $("#projDescEl").value,
        img: images[0] || "", images: images, wide: $("#projWide").checked
      };
      if (!pr.title_el) { toast("Τίτλος απαραίτητος", true); return; }
      projects.unshift(pr);
      await save("data/projects.json", projects, "νέα έμπνευση: " + pr.title_el, () => {
        e.target.reset(); renderProjectList(); toast("Προστέθηκε!");
      });
    } catch (err) { toast("Σφάλμα: " + err.message, true); }
    finally { btn.disabled = false; }
  });

  const CAT_LABEL = { landscape: "Τοπίο", plants: "Φυτά", craft: "Τεχνική" };

  function renderProjectList() {
    $("#projList").innerHTML = projects.map((p) =>
      `<div class="row-item"><div class="row-main">
        ${p.img ? `<img class="row-thumb" src="${esc(p.img)}" alt="">` : `<div class="row-thumb"></div>`}
        <div><strong>${esc(p.title_el)}</strong><small>${esc(CAT_LABEL[p.cat] || p.cat)}</small></div>
       </div><button class="del" data-del-proj="${esc(p.id)}">Διαγραφή</button></div>`
    ).join("") || `<div class="empty">— καμία έμπνευση —</div>`;
    $$("[data-del-proj]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Διαγραφή;")) return;
      projects = projects.filter((x) => x.id !== b.dataset.delProj);
      await save("data/projects.json", projects, "διαγραφή έμπνευσης", () => { renderProjectList(); toast("Διαγράφηκε"); });
    }));
  }

  /* =========================================================
     TEMPLATES
     ========================================================= */
  function fillTplSelect() {
    const opts = templates.map((t) => `<option value="${esc(t.id)}">${esc(t.title_el)}</option>`).join("");
    $("#tplSelect").innerHTML = opts;
    $("#tplMetaSelect").innerHTML = opts;
  }

  $("#tplMetaForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#tplMetaBtn"); btn.disabled = true;
    try {
      const tpl = templates.find((t) => t.id === $("#tplMetaSelect").value);
      if (!tpl) return;
      const file = $("#tplMetaImg").files[0];
      if (file) {
        const b64 = await fileToBase64(file);
        const path = "assets/img/uploads/" + uid("insp") + "-" + file.name.replace(/[^a-z0-9._-]/gi, "");
        await GH.putBinary(path, b64, "εικόνα template");
        tpl.img = path;
      }
      if ($("#tplStoryEl").value.trim()) tpl.story_el = $("#tplStoryEl").value.trim();
      if ($("#tplStoryEn").value.trim()) tpl.story_en = $("#tplStoryEn").value.trim();
      await save("data/templates.json", templates, "ενημέρωση template", () => {
        e.target.reset(); renderTplList(); toast("Ενημερώθηκε!");
      });
    } catch (err) { toast("Σφάλμα: " + err.message, true); }
    finally { btn.disabled = false; }
  });

  $("#tplFileForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#tplBtn"); btn.disabled = true;
    try {
      const tplId = $("#tplSelect").value;
      const file = $("#tplFile").files[0], pass = $("#tplPass").value;
      if (!file || !pass) { toast("Αρχείο και κωδικός απαραίτητα", true); return; }
      const b64 = await fileToBase64(file);
      const cipher = CryptoJS.AES.encrypt(b64, pass).toString();
      const path = "data/templates/" + tplId + "/" + uid("f") + ".enc";
      await GH.putFile(path, cipher, "κρυπτογραφημένο αρχείο");
      const tpl = templates.find((t) => t.id === tplId);
      tpl.files = tpl.files || [];
      tpl.files.push({ id: uid("file"), name: file.name, path: path, size: file.size, added: new Date().toISOString().slice(0, 10) });
      await save("data/templates.json", templates, "νέο αρχείο template", () => {
        e.target.reset(); renderTplList(); toast("Ανέβηκε κρυπτογραφημένο!");
      });
    } catch (err) { toast("Σφάλμα: " + err.message, true); }
    finally { btn.disabled = false; }
  });

  function renderTplList() {
    fillTplSelect();
    $("#tplList").innerHTML = templates.map((t) => {
      const files = (t.files || []).map((f) =>
        `<div class="row-item"><div class="row-main"><div><strong>📄 ${esc(f.name)}</strong><small>${(f.size / 1024 | 0)} KB · ${esc(f.added || "")}</small></div></div>
         <button class="del" data-del-file="${esc(t.id)}::${esc(f.id)}">Διαγραφή</button></div>`).join("");
      return `<h3>${esc(t.title_el)}</h3><div class="rows">${files || `<div class="empty">— κανένα αρχείο —</div>`}</div>`;
    }).join("");
    $$("[data-del-file]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Διαγραφή αρχείου;")) return;
      const parts = b.dataset.delFile.split("::");
      const tpl = templates.find((t) => t.id === parts[0]);
      tpl.files = (tpl.files || []).filter((f) => f.id !== parts[1]);
      await save("data/templates.json", templates, "διαγραφή αρχείου", () => { renderTplList(); toast("Διαγράφηκε"); });
    }));
  }
})();
