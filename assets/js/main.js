/* =========================================================
   main.js — αρχική σελίδα
   ========================================================= */
(function () {
  "use strict";

  /* ---- ΡΥΘΜΙΣΕΙΣ (άλλαξέ τα εδώ) ---- */
  const CONFIG = {
    // Βάλε εδώ το endpoint από το formspree.io (π.χ. https://formspree.io/f/xxxxx)
    formspree: "https://formspree.io/f/your_form_id",
    dataBase: "data/"
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- Language ---------- */
  let lang = localStorage.getItem("lia_lang") || "el";

  function applyLang(l) {
    lang = l;
    localStorage.setItem("lia_lang", l);
    document.documentElement.lang = l;
    const dict = window.I18N[l];
    $$("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (dict[key] != null) el.textContent = dict[key];
    });
    $$("[data-i18n-ph]").forEach((el) => {
      const key = el.getAttribute("data-i18n-ph");
      if (dict[key] != null) el.setAttribute("placeholder", dict[key]);
    });
    $$(".lang-toggle button").forEach((b) =>
      b.classList.toggle("active", b.dataset.lang === l)
    );
    renderProjects();
    renderPosts();
    renderTemplatePreview();
    refreshHero();
  }

  /* ---------- Dynamic hero (rotor / showcase / marquee) ---------- */
  const SHOW_ITEMS = [
    { img: "assets/img/photos/knossos-colonnade.webp", key: "sc1" },
    { img: "assets/img/photos/generalife-water.webp", key: "sc2" },
    { img: "assets/img/photos/dry-terraces.webp", key: "sc3" },
    { img: "assets/img/photos/lavender-senses.webp", key: "sc4" },
    { img: "assets/img/photos/villa-deste.webp", key: "sc5" }
  ];
  let showIdx = 0, rotorIdx = 0, rotorWords = [], heroStarted = false;

  function buildShowcase() {
    const wrap = $("#showImgs"), dots = $("#showDots");
    if (!wrap) return;
    wrap.innerHTML = SHOW_ITEMS.map((s, i) => `<img src="${s.img}" alt="" class="${i === 0 ? "active" : ""}">`).join("");
    dots.innerHTML = SHOW_ITEMS.map((s, i) => `<button data-i="${i}" class="${i === 0 ? "active" : ""}" aria-label="${i + 1}"></button>`).join("");
    $$("#showDots button").forEach((b) => b.addEventListener("click", () => showGo(+b.dataset.i)));
  }
  function showGo(i) {
    if (!SHOW_ITEMS.length) return;
    showIdx = (i + SHOW_ITEMS.length) % SHOW_ITEMS.length;
    $$("#showImgs img").forEach((im, k) => im.classList.toggle("active", k === showIdx));
    $$("#showDots button").forEach((d, k) => d.classList.toggle("active", k === showIdx));
    updateShowLabel();
  }
  function updateShowLabel() {
    const el = $("#showLabel");
    if (el) el.textContent = window.I18N[lang][SHOW_ITEMS[showIdx].key] || "";
  }
  // Words are absolutely positioned, so the container needs an explicit width. Pin it to the
  // widest word: any width change here shifts where the sentence wraps and the whole line jumps.
  // The slack sits at the end of a line that already wraps, so it is not visible.
  function fitRotor(host) {
    const probe = document.createElement("span");
    probe.className = "rotor-word";
    probe.style.visibility = "hidden";
    host.appendChild(probe);
    let max = 0;
    rotorWords.forEach((w) => {
      probe.textContent = w;
      max = Math.max(max, probe.getBoundingClientRect().width);
    });
    probe.remove();
    host.style.width = Math.ceil(max) + "px";
  }
  function setRotorInitial() {
    const host = $("#rotor");
    if (!host) return;
    host.innerHTML = `<span class="rotor-word">${escapeHTML(rotorWords[rotorIdx] || "")}</span>`;
    fitRotor(host);
  }
  function rotorTick() {
    const host = $("#rotor");
    if (!host || rotorWords.length < 2) return;
    const cur = host.querySelector(".rotor-word");
    rotorIdx = (rotorIdx + 1) % rotorWords.length;
    const next = document.createElement("span");
    next.className = "rotor-word in";
    next.textContent = rotorWords[rotorIdx];
    if (cur) { cur.classList.add("out"); setTimeout(() => cur.remove(), 720); }
    host.appendChild(next);
    setTimeout(() => next.classList.remove("in"), 760);
  }
  function buildMarquee() {
    const m = $("#marq");
    if (!m) return;
    const txt = window.I18N[lang]["hero.marquee"] || "";
    const half = txt.repeat(4);
    m.innerHTML = `<span>${escapeHTML(half)}</span><span>${escapeHTML(half)}</span>`;
  }
  function refreshHero() {
    if (!$("#rotor")) return;
    rotorWords = (window.I18N[lang]["hero.rotor"] || "").split("|").filter(Boolean);
    if (rotorIdx >= rotorWords.length) rotorIdx = 0;
    setRotorInitial();
    // the serif loads async; measuring before it lands gives a fallback-font width
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        const host = $("#rotor");
        if (host) fitRotor(host);
      });
    }
    buildMarquee();
    updateShowLabel();
  }
  function startHero() {
    if (heroStarted || !$("#rotor")) return;
    heroStarted = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    setInterval(rotorTick, 3600);
    setInterval(() => showGo(showIdx + 1), 5600);
  }

  window.t = (key) => (window.I18N[lang] && window.I18N[lang][key]) || key;

  /* ---------- Nav ---------- */
  const nav = $(".nav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 40);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const navToggle = $(".nav-toggle");
  const navLinks = $(".nav-links");
  if (navToggle) {
    navToggle.addEventListener("click", () => navLinks.classList.toggle("open"));
    $$(".nav-links a").forEach((a) =>
      a.addEventListener("click", () => navLinks.classList.remove("open"))
    );
  }

  $$(".lang-toggle button").forEach((b) =>
    b.addEventListener("click", () => applyLang(b.dataset.lang))
  );

  /* ---------- Scroll reveal ---------- */
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  const observeReveals = () => $$(".reveal:not(.in)").forEach((el) => io.observe(el));

  /* ---------- Data fetch helper ---------- */
  async function loadJSON(name) {
    try {
      const r = await fetch(CONFIG.dataBase + name + "?t=" + Date.now());
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch (e) {
      console.warn("Δεν φορτώθηκε", name, e);
      return [];
    }
  }

  let PROJECTS = [];
  let POSTS = [];
  let TEMPLATES = [];
  let activeFilter = "all";

  function renderTemplatePreview() {
    const grid = $("#tplPreview");
    if (!grid) return;
    grid.innerHTML = TEMPLATES.map((t) => {
      const era = lang === "el" ? t.era_el : t.era_en;
      const title = lang === "el" ? t.title_el : t.title_en;
      const story = lang === "el" ? t.story_el : t.story_en;
      const img = t.img
        ? `<div class="pv-img"><img src="${escapeAttr(t.img)}" alt="${escapeHTML(title)}" loading="lazy"></div>`
        : `<div class="pv-img"></div>`;
      return `<a href="templates.html">${img}
        <div class="pv-cap"><span class="e">${escapeHTML(era)}</span><h4>${escapeHTML(title)}</h4><p>${escapeHTML(story || "")}</p></div>
      </a>`;
    }).join("");
  }

  function projectMatches(p) {
    if (activeFilter === "all") return true;
    return p.cat === activeFilter;
  }

  function imagesOf(item) {
    if (Array.isArray(item.images) && item.images.length) return item.images;
    if (item.img) return [item.img];
    return [];
  }

  function renderProjects() {
    const grid = $("#projectGrid");
    if (!grid) return;
    const items = PROJECTS.filter(projectMatches);
    grid.innerHTML = items
      .map((p, i) => {
        const title = lang === "el" ? p.title_el : p.title_en;
        const desc = lang === "el" ? p.desc_el : p.desc_en;
        const cat = catLabel(p.cat);
        const imgs = imagesOf(p);
        const cover = imgs[0];
        const thumb = cover
          ? `<div class="thumb" style="background-image:url('${escapeAttr(cover)}')"></div>`
          : `<div class="thumb placeholder"></div>`;
        const badge = imgs.length > 1 ? `<span class="img-badge">▣ ${imgs.length}</span>` : "";
        return `<article class="project-card ${p.wide ? "wide" : ""} reveal" data-open="project" data-id="${escapeAttr(p.id)}">
          ${thumb}${badge}
          <div class="overlay">
            <span class="cat">${cat}</span>
            <h3>${escapeHTML(title)}</h3>
            <p>${escapeHTML(desc || "")}</p>
          </div>
        </article>`;
      })
      .join("");
    bindCardOpens();
    observeReveals();
  }

  function catLabel(c) {
    return window.I18N[lang]["work.f." + c] || c;
  }

  function renderPosts() {
    const grid = $("#postGrid");
    if (!grid) return;
    if (!POSTS.length) {
      grid.innerHTML = `<div class="empty-note" data-i18n="ideas.empty">${window.I18N[lang]["ideas.empty"]}</div>`;
      return;
    }
    grid.innerHTML = POSTS.map((p) => {
      const title = lang === "el" ? p.title_el : p.title_en;
      const body = lang === "el" ? p.body_el : p.body_en;
      const tag = lang === "el" ? p.tag_el : p.tag_en;
      const imgs = imagesOf(p);
      const cover = imgs[0];
      const figure = cover
        ? `<div class="post-figure"><img src="${escapeAttr(cover)}" alt="${escapeHTML(title)}" loading="lazy"></div>`
        : "";
      const badge = imgs.length > 1 ? `<span class="img-badge">▣ ${imgs.length}</span>` : "";
      return `<article class="post-card reveal" data-open="post" data-id="${escapeAttr(p.id)}">
        ${figure}${badge}
        <div class="post-body">
          <time>${formatDate(p.date)}</time>
          <h3>${escapeHTML(title)}</h3>
          <p>${escapeHTML(body || "")}</p>
          <span class="tag">${escapeHTML(tag || "")}</span>
        </div>
      </article>`;
    }).join("");
    bindCardOpens();
    observeReveals();
  }

  /* ---------- Filters ---------- */
  $$(".filters button").forEach((b) =>
    b.addEventListener("click", () => {
      $$(".filters button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      activeFilter = b.dataset.filter;
      renderProjects();
    })
  );

  /* ---------- Contact form (Formspree) ---------- */
  const form = $("#contactForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = $("#formStatus");
      const btn = $("#formBtn");
      status.className = "form-status";
      status.textContent = window.I18N[lang]["contact.sending"];
      btn.disabled = true;
      try {
        if (CONFIG.formspree.includes("your_form_id")) {
          // Δεν έχει ρυθμιστεί ακόμα το Formspree — προσομοίωση επιτυχίας
          await new Promise((r) => setTimeout(r, 700));
        } else {
          const res = await fetch(CONFIG.formspree, {
            method: "POST",
            headers: { Accept: "application/json" },
            body: new FormData(form)
          });
          if (!res.ok) throw new Error(res.status);
        }
        status.className = "form-status ok";
        status.textContent = window.I18N[lang]["contact.ok"];
        form.reset();
      } catch (err) {
        status.className = "form-status err";
        status.textContent = window.I18N[lang]["contact.err"];
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* ---------- Helpers ---------- */
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }
  function escapeAttr(s) {
    return String(s).replace(/'/g, "%27").replace(/"/g, "%22");
  }
  function formatDate(d) {
    if (!d) return "";
    try {
      return new Date(d).toLocaleDateString(lang === "el" ? "el-GR" : "en-GB", {
        day: "2-digit", month: "long", year: "numeric"
      });
    } catch (_) {
      return d;
    }
  }

  /* ---------- Lightbox gallery ---------- */
  const lb = {
    el: $("#lightbox"), img: $("#lbImg"), title: $("#lbTitle"), body: $("#lbBody"),
    cat: $("#lbCat"), count: $("#lbCount"), thumbs: $("#lbThumbs"),
    imgs: [], idx: 0
  };

  function bindCardOpens() {
    $$("[data-open]").forEach((card) => {
      if (card._bound) return;
      card._bound = true;
      card.addEventListener("click", () => {
        const type = card.getAttribute("data-open");
        const id = card.getAttribute("data-id");
        const src = type === "project" ? PROJECTS : POSTS;
        const item = src.find((x) => x.id === id);
        if (item) openLightbox(item, type);
      });
    });
  }

  function openLightbox(item, type) {
    if (!lb.el) return;
    lb.imgs = imagesOf(item);
    if (!lb.imgs.length) return; // δεν ανοίγει χωρίς φωτογραφίες
    lb.idx = 0;
    lb.cat.textContent = type === "project"
      ? catLabel(item.cat)
      : (lang === "el" ? item.tag_el : item.tag_en) || "";
    lb.title.textContent = lang === "el" ? item.title_el : item.title_en;
    lb.body.textContent = type === "project"
      ? (lang === "el" ? item.desc_el : item.desc_en) || ""
      : (lang === "el" ? item.body_el : item.body_en) || "";
    lb.thumbs.innerHTML = lb.imgs.length > 1
      ? lb.imgs.map((s, i) => `<img src="${escapeAttr(s)}" data-i="${i}" alt="">`).join("")
      : "";
    $$("#lbThumbs img").forEach((t) =>
      t.addEventListener("click", (e) => { e.stopPropagation(); showImg(+t.dataset.i); })
    );
    showImg(0);
    lb.el.classList.add("open");
    lb.el.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function showImg(i) {
    lb.idx = (i + lb.imgs.length) % lb.imgs.length;
    lb.img.src = lb.imgs[lb.idx];
    lb.count.textContent = lb.imgs.length > 1 ? `${lb.idx + 1} / ${lb.imgs.length}` : "";
    $$("#lbThumbs img").forEach((t) => t.classList.toggle("active", +t.dataset.i === lb.idx));
    const multi = lb.imgs.length > 1;
    $("#lbPrev").style.display = multi ? "grid" : "none";
    $("#lbNext").style.display = multi ? "grid" : "none";
  }

  function closeLightbox() {
    lb.el.classList.remove("open");
    lb.el.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  if (lb.el) {
    $("#lbClose").addEventListener("click", closeLightbox);
    $("#lbPrev").addEventListener("click", (e) => { e.stopPropagation(); showImg(lb.idx - 1); });
    $("#lbNext").addEventListener("click", (e) => { e.stopPropagation(); showImg(lb.idx + 1); });
    lb.el.addEventListener("click", (e) => { if (e.target === lb.el) closeLightbox(); });
    document.addEventListener("keydown", (e) => {
      if (!lb.el.classList.contains("open")) return;
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowLeft") showImg(lb.idx - 1);
      else if (e.key === "ArrowRight") showImg(lb.idx + 1);
    });
  }

  /* ---------- Hero canvas: floating leaves + light ---------- */
  function initHero() {
    const canvas = $("#heroCanvas");
    if (!canvas) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = canvas.getContext("2d");
    let w, h, particles = [], raf;

    function resize() {
      w = canvas.width = canvas.offsetWidth * devicePixelRatio;
      h = canvas.height = canvas.offsetHeight * devicePixelRatio;
    }
    resize();
    window.addEventListener("resize", resize);

    const COLORS = ["#8fa87c", "#b5c98a", "#6b8759", "#cfdcc2", "#a7c957"];
    const N = Math.min(70, Math.floor(w / 26));
    for (let i = 0; i < N; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: (Math.random() * 3 + 1) * devicePixelRatio,
        vx: (Math.random() - 0.5) * 0.25 * devicePixelRatio,
        vy: (Math.random() * 0.4 + 0.1) * devicePixelRatio,
        a: Math.random() * 0.5 + 0.15,
        sway: Math.random() * Math.PI * 2,
        color: COLORS[(Math.random() * COLORS.length) | 0]
      });
    }

    function frame() {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.sway += 0.01;
        p.x += p.vx + Math.sin(p.sway) * 0.3 * devicePixelRatio;
        p.y += p.vy;
        if (p.y > h + 10) { p.y = -10; p.x = Math.random() * w; }
        if (p.x > w + 10) p.x = -10;
        if (p.x < -10) p.x = w + 10;
        ctx.globalAlpha = p.a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.r, p.r * 1.8, p.sway, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    if (!reduce) frame();
    else {
      // static single frame
      for (const p of particles) {
        ctx.globalAlpha = p.a; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 1.8, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  /* ---------- Site customisation (data/site.json, edited from the admin panel) ----------
     Theme colours land as :root custom-property overrides; text lands as I18N overrides.
     Empty values are ignored so a half-filled file never blanks the design. */
  function applySite(site) {
    if (!site || typeof site !== "object") return;

    const root = document.documentElement;
    Object.entries(site.theme || {}).forEach(([prop, val]) => {
      if (prop.startsWith("--") && val) root.style.setProperty(prop, val);
    });

    const hero = site.hero || {};
    if (hero.image) {
      const layer = $(".hero-photo");
      if (layer) {
        layer.style.backgroundImage = `url("${String(hero.image).replace(/"/g, "%22")}")`;
        layer.style.opacity = hero.opacity || "0.32";
      }
    }

    ["el", "en"].forEach((l) => {
      const over = (site.text || {})[l];
      if (!over || !window.I18N[l]) return;
      Object.entries(over).forEach(([k, v]) => {
        if (typeof v === "string" && v.trim()) window.I18N[l][k] = v;
      });
    });
  }

  /* ---------- Photo credits (Wikimedia Commons attribution) ---------- */
  function renderCredits(credits) {
    const host = $("#creditList");
    if (!host || !credits.length) return;
    host.innerHTML = credits
      .map(
        (c) =>
          `<li><a href="${escapeAttr(c.page)}" target="_blank" rel="noopener noreferrer">${escapeHTML(
            c.file
          )}</a> — ${escapeHTML(c.author)} · ${escapeHTML(c.license)}</li>`
      )
      .join("");
  }

  /* ---------- Init ---------- */
  async function init() {
    initHero();
    buildShowcase();
    let CREDITS, SITE;
    [PROJECTS, POSTS, TEMPLATES, CREDITS, SITE] = await Promise.all([
      loadJSON("projects.json"),
      loadJSON("posts.json"),
      loadJSON("templates.json"),
      loadJSON("credits.json"),
      loadJSON("site.json")
    ]);
    applySite(SITE); // before applyLang — it may override the strings applyLang paints
    renderCredits(CREDITS);
    applyLang(lang);
    startHero();
    observeReveals();
  }
  init();
})();
