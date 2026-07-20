/* =========================================================
   github.js — μικρός βοηθός για το GitHub Contents API
   Χρησιμοποιείται από admin.html και templates.html
   ========================================================= */
window.GH = (function () {
  "use strict";
  const LS = "lia_gh_cfg";

  function cfg() {
    try { return JSON.parse(localStorage.getItem(LS)) || {}; }
    catch (_) { return {}; }
  }
  function saveCfg(c) { localStorage.setItem(LS, JSON.stringify(c)); }
  function clearCfg() { localStorage.removeItem(LS); }

  function headers() {
    const c = cfg();
    const h = { Accept: "application/vnd.github+json" };
    if (c.token) h.Authorization = "Bearer " + c.token;
    return h;
  }
  function apiBase() {
    const c = cfg();
    return `https://api.github.com/repos/${c.owner}/${c.repo}/contents/`;
  }

  // UTF-8 safe base64
  function b64encode(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }
  function b64decode(b64) {
    return decodeURIComponent(escape(atob(b64)));
  }

  async function whoami() {
    const r = await fetch("https://api.github.com/user", { headers: headers() });
    if (!r.ok) throw new Error("auth");
    return r.json();
  }

  async function getFile(path) {
    const c = cfg();
    const url = apiBase() + path + "?ref=" + (c.branch || "main");
    const r = await fetch(url, { headers: headers() });
    if (r.status === 404) return { exists: false, sha: null, content: null };
    if (!r.ok) throw new Error("get " + path + " " + r.status);
    const j = await r.json();
    return { exists: true, sha: j.sha, content: b64decode(j.content.replace(/\n/g, "")), raw: j };
  }

  async function putFile(path, contentStr, message, isBase64) {
    const c = cfg();
    const cur = await getFile(path).catch(() => ({ sha: null }));
    const body = {
      message: message || ("update " + path),
      content: isBase64 ? contentStr : b64encode(contentStr),
      branch: c.branch || "main"
    };
    if (cur && cur.sha) body.sha = cur.sha;
    const r = await fetch(apiBase() + path, {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, headers()),
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error("put " + path + " " + r.status + " " + err);
    }
    return r.json();
  }

  async function getJSON(path) {
    const f = await getFile(path);
    if (!f.exists || !f.content) return [];
    try { return JSON.parse(f.content); } catch (_) { return []; }
  }

  async function putJSON(path, obj, message) {
    return putFile(path, JSON.stringify(obj, null, 2), message);
  }

  // upload a raw base64 file (images, encrypted blobs)
  async function putBinary(path, base64NoPrefix, message) {
    return putFile(path, base64NoPrefix, message, true);
  }

  function rawUrl(path) {
    const c = cfg();
    return `https://raw.githubusercontent.com/${c.owner}/${c.repo}/${c.branch || "main"}/${path}`;
  }

  function pagesUrl(path) {
    // relative works on the site itself; kept for reference
    return path;
  }

  return {
    cfg, saveCfg, clearCfg, whoami, getFile, putFile,
    getJSON, putJSON, putBinary, rawUrl, pagesUrl, b64encode, b64decode
  };
})();
