// Graphite 프론트엔드: 렌더링 후처리(이미지·코드·KaTeX·Mermaid), 목차, 찾기, 편집 토글, 파일 감시 이벤트
"use strict";

const T = window.__TAURI__ ?? null;
const invoke = T ? T.core.invoke : async () => null;
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD_LABEL = IS_MAC ? "⌘" : "Ctrl";
const MD_RE = /\.(md|markdown|mdown|mkd|mkdn|txt)$/i;

// 개발 빌드에서는 웹뷰 오류가 `npm run dev` 터미널에 [web]으로 찍힌다 (릴리스에서는 무시됨)
const devLog = (msg) => { if (T) invoke("dev_log", { msg: String(msg) }).catch(() => {}); };
window.addEventListener("error", (e) => devLog(`오류: ${e.message} (${e.filename}:${e.lineno})`));
window.addEventListener("unhandledrejection", (e) => devLog(`처리 안 된 Promise: ${e.reason?.message ?? e.reason}`));

const $ = (id) => document.getElementById(id);
const app = $("app");
const viewer = $("viewer");
const content = $("content");
const editor = $("editor");

const state = {
  doc: null,        // { path, name, dir, raw, html }
  savedRaw: "",     // 디스크에 저장된 원문
  raw: "",          // 현재 원문 (편집 반영)
  html: "",         // 마지막으로 그린 HTML
  editing: false,
  dirty: false,
  guard: false,     // 백엔드에 알린 보호 상태 (editing || dirty)
  conflict: false,  // 편집 중 외부 변경이 있었음
  renderSeq: 0,
};

// ───────────────────────── 유틸 ─────────────────────────

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const loaded = new Map();
function loadScript(src) {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error(`${src}를 불러오지 못했어요`));
      document.head.appendChild(s);
    }));
  }
  return loaded.get(src);
}
function loadCss(href) {
  if (!loaded.has(href)) {
    loaded.set(href, new Promise((resolve) => {
      const l = document.createElement("link");
      l.rel = "stylesheet"; l.href = href; l.onload = resolve; l.onerror = resolve;
      document.head.appendChild(l);
    }));
  }
  return loaded.get(href);
}

// 토스트 알림: ui.css의 .t-toast (위쪽 가운데, 흰 면 + 떠 있는 그림자)
let toastTimer;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  el.style.animation = "none";
  void el.offsetHeight; // 연달아 띄울 때도 나타나는 효과를 다시 재생
  el.style.animation = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 1800);
}

const isDark = () => matchMedia("(prefers-color-scheme: dark)").matches;
// ui.css의 다크 토큰은 <html data-theme="dark">로 켠다
const applyTheme = () => (document.documentElement.dataset.theme = isDark() ? "dark" : "light");
applyTheme();
const isAbsPath = (p) => p.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("\\\\");

function slugify(text) {
  return text.trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-") || "section";
}

// ───────────────────────── 렌더링 ─────────────────────────

const BLOCKED_TAGS = "script, iframe, frame, frameset, object, embed, base, meta, link, style, form, noscript";

/** comrak은 문서 안 HTML을 그대로 통과시키므로, 화면에 붙이기 전 inert template에서 정리한다 */
function sanitize(fragment) {
  fragment.querySelectorAll(BLOCKED_TAGS).forEach((el) => el.remove());
  fragment.querySelectorAll("*").forEach((el) => {
    for (const { name, value } of [...el.attributes]) {
      const n = name.toLowerCase();
      if (n.startsWith("on") || n === "srcdoc" ||
          ((n === "href" || n === "src" || n === "xlink:href" || n === "action") && /^\s*(javascript|vbscript):/i.test(value))) {
        el.removeAttribute(name);
      }
    }
  });
}

function langOf(pre) {
  const code = pre.querySelector("code");
  const cls = code?.className.match(/language-([\w+#.-]+)/);
  return (cls?.[1] || pre.getAttribute("lang") || "").toLowerCase();
}

async function showHtml(html, { keepScroll = false } = {}) {
  const seq = ++state.renderSeq;
  const top = viewer.scrollTop;
  state.html = html;

  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  sanitize(tpl.content);
  content.replaceChildren(tpl.content);

  fixImages();
  decorate();
  const jobs = [renderMath(seq), renderMermaid(seq), highlightCode(seq)];
  buildToc();
  if (keepScroll) viewer.scrollTop = top;

  await Promise.allSettled(jobs);
  if (seq !== state.renderSeq) return;
  invalidateViewMap(); // 수식·다이어그램으로 높이가 바뀌었으니 위치표를 다시 잰다
  if (keepScroll) viewer.scrollTop = top; // 수식/다이어그램으로 높이가 바뀐 뒤 한 번 더
  updateActiveToc();
  if (search.open) search.run(search.input.value, { keepIndex: true });
  const imgs = [...content.querySelectorAll("img")];
  await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
  if (seq !== state.renderSeq) return;
  devLog(`렌더 완료: ${state.doc?.name} | 제목 ${tocLinks.length}개, 수식 ${content.querySelectorAll(".katex").length}개, ` +
    `다이어그램 ${content.querySelectorAll(".mermaid-block svg").length}개, 이미지 ${imgs.filter((i) => i.complete && i.naturalWidth).length}/${imgs.length}개 표시`);
}

const ICONS = {
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h0"/>',
  warn: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5h0"/>',
  tip: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
};
const svgIcon = (name) => `<svg class="t-ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

const ALERTS = {
  note: { title: "참고", icon: "info", mod: "" },
  tip: { title: "도움말", icon: "tip", mod: "" },
  important: { title: "중요", icon: "warn", mod: "t-callout--warn" },
  warning: { title: "주의", icon: "warn", mod: "t-callout--warn" },
  caution: { title: "위험", icon: "warn", mod: "t-callout--danger" },
};

/** 마크다운 요소를 문서용 부품으로 바꾼다: 알림 → .t-callout, 표 → .t-table, 번호 목록 시작값 */
function decorate() {
  content.querySelectorAll(".markdown-alert").forEach((box) => {
    const kind = [...box.classList].map((c) => c.replace("markdown-alert-", "")).find((k) => ALERTS[k]) ?? "note";
    const a = ALERTS[kind];
    const callout = document.createElement("div");
    callout.className = `t-callout ${a.mod}`.trim();
    callout.innerHTML = `<span class="t-callout__icon">${svgIcon(a.icon)}</span><div class="t-callout__body"></div>`;
    const body = callout.lastElementChild;
    box.querySelector(".markdown-alert-title")?.remove();
    const title = document.createElement("strong");
    title.className = "callout-title";
    title.textContent = a.title;
    body.append(title, ...box.childNodes);
    keepPos(box, callout);
    box.replaceWith(callout);
  });
  content.querySelectorAll("table").forEach((table) => {
    table.classList.add("t-table");
    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    table.replaceWith(wrap);
    wrap.appendChild(table);
  });
  content.querySelectorAll("ol[start]").forEach((ol) => {
    ol.style.counterReset = `s ${(parseInt(ol.getAttribute("start"), 10) || 1) - 1}`;
  });
}

/** 렌더 단계에서 못 바꾼 이미지(HTML로 직접 쓴 <img>)를 asset URL로 바꾼다 */
function fixImages() {
  content.querySelectorAll("img[src]").forEach(async (img) => {
    const src = img.getAttribute("src");
    if (/^(https?:|data:|blob:|asset:|http:\/\/asset\.localhost)/i.test(src)) return;
    img.removeAttribute("src");
    const url = await invoke("resolve_asset", { src });
    if (url) img.src = url;
    else img.alt = img.alt || `이미지를 찾지 못했어요: ${src}`;
  });
}

async function renderMath(seq) {
  const nodes = content.querySelectorAll("[data-math-style]");
  if (!nodes.length) return;
  await Promise.all([loadScript("vendor/katex/katex.min.js"), loadCss("vendor/katex/katex.min.css")]);
  if (seq !== state.renderSeq) return;
  nodes.forEach((el) => {
    const display = el.dataset.mathStyle === "display";
    const tex = el.textContent;
    let target = el;
    // ```math 블록(<pre><code data-math-style>)과 $$ 블록(<div>)은 div로 바꿔 끼운다
    if (el.tagName === "CODE" || el.tagName === "DIV") {
      target = document.createElement("div");
      target.className = "math-block";
      const old = el.tagName === "CODE" ? el.closest("pre") : el;
      keepPos(old, target);
      old.replaceWith(target);
    }
    try {
      window.katex.render(tex, target, { displayMode: display, throwOnError: false, output: "htmlAndMathml" });
    } catch (e) {
      target.className = "math-error";
      target.textContent = tex;
    }
  });
}

// 입력할 때마다 다이어그램을 새로 그리면 깜빡이므로, 같은 원문·테마는 그려 둔 SVG를 다시 쓴다
const mermaidCache = new Map();
async function renderMermaid(seq) {
  const blocks = [...content.querySelectorAll("pre")].filter((pre) => langOf(pre) === "mermaid");
  if (!blocks.length) return;
  await loadScript("vendor/mermaid/mermaid.min.js");
  if (seq !== state.renderSeq) return;
  const m = window.mermaid;
  // 다이어그램을 파랑 테두리·연한 면·회색 선으로 맞춘다 (값은 ui.css 토큰에서 읽음)
  const tok = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const dark = isDark();
  m.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    fontFamily: getComputedStyle(document.body).fontFamily,
    themeVariables: {
      fontSize: "14px",
      primaryColor: dark ? tok("--code-navy-2") : tok("--blue-50"),
      primaryBorderColor: tok("--blue-500"),
      primaryTextColor: tok("--text-2"),
      secondaryColor: tok("--surface"),
      tertiaryColor: tok("--surface"),
      lineColor: tok("--text-5"),
      textColor: tok("--text-3"),
      edgeLabelBackground: tok("--surface-2"),
      clusterBkg: tok("--surface"),
      clusterBorder: tok("--line"),
      noteBkgColor: dark ? tok("--dark-surface") : tok("--yellow-50"),
      noteBorderColor: tok("--yellow-300"),
      noteTextColor: tok("--text-2"),
      actorBkg: dark ? tok("--code-navy-2") : tok("--blue-50"),
      actorBorder: tok("--blue-500"),
      actorTextColor: tok("--text-2"),
    },
  });
  for (const [i, pre] of blocks.entries()) {
    const box = document.createElement("div");
    box.className = "mermaid-block";
    keepPos(pre, box);
    const src = pre.textContent;
    pre.replaceWith(box);
    const key = `${dark ? "d" : "l"}:${src}`;
    if (mermaidCache.has(key)) { box.innerHTML = mermaidCache.get(key); continue; }
    try {
      const { svg } = await m.render(`mmd-${seq}-${i}`, src);
      if (mermaidCache.size > 50) mermaidCache.clear();
      mermaidCache.set(key, svg);
      if (seq !== state.renderSeq) return;
      box.innerHTML = svg;
    } catch (e) {
      box.classList.add("error");
      box.textContent = `Mermaid 다이어그램을 그리지 못했어요\n${e?.message ?? e}`;
      document.getElementById(`dmmd-${seq}-${i}`)?.remove(); // 실패 시 남는 임시 노드 정리
    }
  }
}

async function highlightCode(seq) {
  const pres = [...content.querySelectorAll("pre")].filter((pre) => {
    const l = langOf(pre);
    return l !== "mermaid" && l !== "math" && pre.querySelector("code");
  });
  // 남색 코드 패널(.t-codep): 머리에 언어 이름과 복사 버튼
  pres.forEach((pre) => {
    const panel = document.createElement("div");
    panel.className = "t-codep";
    const head = document.createElement("div");
    head.className = "t-codep__head";
    const lang = document.createElement("span");
    lang.className = "code-lang";
    lang.textContent = langOf(pre) || "text";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "t-iconbtn t-iconbtn--sm t-codep__copy";
    btn.setAttribute("aria-label", "코드 복사");
    btn.title = "코드 복사";
    btn.innerHTML = svgIcon("copy");
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(pre.querySelector("code").textContent);
        toast("코드를 복사했어요");
      } catch { toast("복사하지 못했어요"); }
    });
    head.append(lang, btn);
    pre.replaceWith(panel);
    panel.append(head, pre);
    keepPos(pre, panel); // 머리까지 포함한 패널 전체를 원문 블록에 대응시킨다
    pre.removeAttribute("data-sourcepos");
  });
  if (!pres.length) return;
  await loadScript("vendor/hljs/highlight.min.js");
  if (seq !== state.renderSeq) return;
  const hljs = window.hljs;
  hljs.configure({ ignoreUnescapedHTML: true });
  pres.forEach((pre) => {
    const code = pre.querySelector("code");
    const lang = langOf(pre);
    if (lang && !hljs.getLanguage(lang)) return; // 모르는 언어는 그대로
    hljs.highlightElement(code);
  });
}

// ───────────────────────── 목차 ─────────────────────────

let tocLinks = [];
function buildToc() {
  const list = $("toc-list");
  list.replaceChildren();
  tocLinks = [];
  const used = new Set();
  content.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((h) => {
    let id = h.id || slugify(h.textContent);
    let n = 1, base = id;
    while (used.has(id) || (document.getElementById(id) && document.getElementById(id) !== h)) id = `${base}-${n++}`;
    used.add(id);
    h.id = id;
    const level = +h.tagName[1];
    if (level > 3) return;
    const a = document.createElement("a");
    a.href = `#${id}`;
    a.className = `l${level}`;
    a.textContent = h.textContent;
    a.title = h.textContent;
    a.addEventListener("click", (e) => { e.preventDefault(); scrollToEl(h); });
    list.appendChild(a);
    tocLinks.push({ a, h });
  });
  $("toc").classList.toggle("is-empty", tocLinks.length === 0);
}

function scrollToEl(el) {
  const y = el.getBoundingClientRect().top - viewer.getBoundingClientRect().top + viewer.scrollTop - 20;
  viewer.scrollTo({ top: y, behavior: "smooth" });
}

let tocRaf = 0;
function updateActiveToc() {
  tocRaf = 0;
  if (!tocLinks.length) return;
  const limit = viewer.getBoundingClientRect().top + 80;
  let current = tocLinks[0];
  for (const item of tocLinks) {
    if (item.h.getBoundingClientRect().top <= limit) current = item; else break;
  }
  tocLinks.forEach(({ a }) => (a === current.a ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  current.a.scrollIntoView({ block: "nearest" });
}
viewer.addEventListener("scroll", () => { if (!tocRaf) tocRaf = requestAnimationFrame(updateActiveToc); }, { passive: true });

const isNarrow = () => matchMedia("(max-width: 768px)").matches;
function setTocOpen(open, { remember = true } = {}) {
  app.classList.toggle("toc-hidden", !open);
  $("toc").dataset.open = String(open); // 좁은 창에서 ui.css가 이 값으로 시트를 연다
  $("btn-toc").setAttribute("aria-expanded", String(open));
  if (remember && !isNarrow()) store.set("tocOpen", open);
}
$("toc-scrim").addEventListener("click", () => setTocOpen(false, { remember: false }));
$("toc-list").addEventListener("click", () => { if (isNarrow()) setTocOpen(false, { remember: false }); });

// ───────────────────────── 문서 열기 / 상태 ─────────────────────────

function updateChrome() {
  const name = state.doc?.name ?? "Graphite";
  app.classList.toggle("no-doc", !state.doc);
  app.classList.toggle("editing", state.editing);
  app.classList.toggle("dirty", state.dirty);
  $("doc-name").textContent = state.doc ? name : "";
  $("doc-name").title = state.doc?.path ?? "";
  $("seg-view").setAttribute("aria-selected", String(!state.editing));
  $("seg-edit").setAttribute("aria-selected", String(state.editing));
  renderCrumbs();
  const title = state.doc ? `${state.dirty ? "* " : ""}${name} — Graphite` : "Graphite";
  document.title = title;
  T?.window.getCurrentWindow().setTitle(title).catch(() => {});
}

/** 본문 위 위치 표시(.t-crumbs): 상위 폴더 두 단계 / 파일 이름 */
function renderCrumbs() {
  const nav = $("crumbs");
  nav.replaceChildren();
  if (!state.doc) return;
  const parts = state.doc.path.split(/[\\/]/).filter(Boolean);
  const shown = parts.slice(-3);
  if (parts.length > shown.length) shown.unshift("…");
  shown.forEach((p, i) => {
    if (i) { const sep = document.createElement("i"); sep.textContent = "/"; nav.append(sep); }
    const s = document.createElement("span");
    s.textContent = p;
    nav.append(s);
  });
  nav.title = state.doc.path;
}

function syncGuard() {
  const on = state.editing || state.dirty;
  if (on !== state.guard) {
    state.guard = on;
    invoke("set_guard", { on });
  }
}

function setDirty(d) {
  if (d === state.dirty) return;
  state.dirty = d;
  updateChrome();
  syncGuard();
}

async function loadDoc(doc, { keepScroll = false } = {}) {
  state.doc = doc;
  state.raw = state.savedRaw = doc.raw;
  state.editing = false;
  state.dirty = false;
  state.guard = false; // 백엔드 open_file이 이미 false로 맞춤
  hideBanner();
  updateChrome();
  if (!keepScroll) viewer.scrollTop = 0;
  await showHtml(doc.html, { keepScroll });
}

async function confirmDiscard(message) {
  if (!state.dirty) return true;
  if (!T) return confirm(message);
  return T.dialog.ask(message, { title: "Graphite", kind: "warning", okLabel: "버리기", cancelLabel: "취소" });
}

async function openPath(path) {
  if (!path) return;
  if (state.doc && path === state.doc.path && !state.dirty) return;
  if (!(await confirmDiscard("저장하지 않은 변경이 있어요. 버리고 다른 파일을 열까요?"))) return;
  try {
    const doc = await invoke("open_file", { path });
    await loadDoc(doc);
  } catch (e) {
    toast(String(e));
  }
}

async function openDialog() {
  if (!T) return;
  const path = await T.dialog.open({
    multiple: false,
    directory: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd", "mkdn", "txt"] }],
  });
  if (typeof path === "string") openPath(path);
}

// ───────────────────────── 편집 모드 ─────────────────────────

async function toggleEdit(force) {
  if (!state.doc) return;
  const next = typeof force === "boolean" ? force : !state.editing;
  if (next === state.editing) return;
  if (next) {
    // 뷰어는 그대로 두고 오른쪽에 편집기를 연다
    editor.value = state.raw;
    invalidateEditMap();
    state.editing = true;
    search.close();
    updateChrome();
    syncGuard();
    syncScroll("viewer"); // 지금 보던 위치의 원문 줄로 편집기를 맞춘다
    editor.focus({ preventScroll: true });
  } else {
    state.raw = editor.value;
    if (previewTimer) await renderPreview(); // 아직 반영 안 된 입력이 있으면 마지막으로 그린다
    state.editing = false;
    search.close();
    updateChrome();
    syncGuard();
    viewer.focus({ preventScroll: true });
  }
}

// ── 실시간 미리보기: 입력이 잠깐 멈추면 왼쪽 뷰어를 다시 그린다 ──
let previewTimer = 0;
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 160);
}
async function renderPreview() {
  clearTimeout(previewTimer);
  previewTimer = 0;
  if (!T || !state.doc) return;
  const raw = state.raw;
  const html = raw === state.savedRaw && state.doc.html ? state.doc.html : await invoke("render_markdown", { raw });
  if (raw !== state.raw) return; // 그사이 더 입력했으면 다음 차례에 그린다
  await showHtml(html ?? "", { keepScroll: true });
}

// ── 스크롤 동기화: 사용자가 만지고 있는 쪽을 기준으로 다른 쪽을 같은 비율로 맞춘다 ──
let scrollLead = "editor";
editor.addEventListener("pointerenter", () => (scrollLead = "editor"));
editor.addEventListener("keydown", () => (scrollLead = "editor"));
viewer.addEventListener("pointerenter", () => (scrollLead = "viewer"));
editor.addEventListener("scroll", () => { if (state.editing && scrollLead === "editor") syncScroll("editor"); }, { passive: true });
viewer.addEventListener("scroll", () => { if (state.editing && scrollLead === "viewer") syncScroll("viewer"); }, { passive: true });

/*
 * 줄 기준 스크롤 동기화
 * - 뷰어: 렌더러가 블록마다 붙인 data-sourcepos(시작줄-끝줄)로 "원문 줄 → 화면 y" 기준점을 만든다.
 *   블록 위·아래 경계가 기준점이고, 코드 블록처럼 긴 블록 안에서는 그 블록 안에서만 비율로 맞춘다.
 * - 편집기: 긴 줄은 자동 줄바꿈되므로 보이지 않는 복제 영역(mirror)에서 각 줄의 실제 y를 잰다.
 * 두 표를 원문 줄로 이어서 한쪽 스크롤 위치를 다른 쪽으로 옮긴다.
 */
const BLOCK_TAGS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "PRE", "TABLE", "TR", "BLOCKQUOTE", "DIV", "HR", "SECTION", "UL", "OL", "DETAILS"]);
let viewMap = null; // [{ line, y }] — line은 0부터 시작하는 원문 줄, y는 뷰어 스크롤 좌표
let editMap = null; // [{ line, y }] — 편집기 각 줄의 위쪽 y
function invalidateViewMap() { viewMap = null; }
function invalidateEditMap() { editMap = null; }

function keepPos(from, to) {
  if (from?.dataset?.sourcepos) to.dataset.sourcepos = from.dataset.sourcepos;
}

function buildViewMap() {
  const base = viewer.getBoundingClientRect().top - viewer.scrollTop;
  const pts = [{ line: 0, y: 0 }];
  for (const el of content.querySelectorAll("[data-sourcepos]")) {
    if (!BLOCK_TAGS.has(el.tagName)) continue;
    const m = /^(\d+):\d+-(\d+):\d+/.exec(el.dataset.sourcepos);
    if (!m) continue;
    const r = el.getBoundingClientRect();
    if (!r.height) continue;
    pts.push({ line: +m[1] - 1, y: r.top - base }, { line: +m[2], y: r.bottom - base });
  }
  pts.push({ line: editor.value.split("\n").length, y: viewer.scrollHeight });
  pts.sort((a, b) => a.line - b.line || a.y - b.y);
  // 줄과 y가 함께 늘어나는 점만 남겨야 양방향으로 찾을 수 있다
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || (p.line >= last.line && p.y >= last.y)) out.push(p);
  }
  return out;
}

const mirror = document.createElement("div");
mirror.className = "editor-mirror";
mirror.setAttribute("aria-hidden", "true");
editor.parentElement.appendChild(mirror);
function buildEditMap() {
  const cs = getComputedStyle(editor);
  for (const k of ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "wordSpacing", "tabSize",
    "paddingTop", "paddingLeft", "paddingRight", "whiteSpace", "wordBreak", "overflowWrap"]) mirror.style[k] = cs[k];
  mirror.style.width = `${editor.clientWidth}px`; // 스크롤바를 뺀 실제 글자 폭
  const lines = editor.value.split("\n");
  mirror.replaceChildren(...lines.map((l) => {
    const d = document.createElement("div");
    d.textContent = l || "\u200b";
    return d;
  }));
  const pts = [];
  [...mirror.children].forEach((d, i) => pts.push({ line: i, y: d.offsetTop }));
  const last = mirror.lastElementChild;
  pts.push({ line: lines.length, y: last ? last.offsetTop + last.offsetHeight : 0 });
  mirror.replaceChildren(); // 측정만 하고 비운다
  return pts;
}

/** pts에서 key 값이 val인 지점의 out 값을 선형 보간으로 구한다 (pts는 key 기준 오름차순) */
function interp(pts, key, val, out) {
  let lo = 0, hi = pts.length - 1;
  if (hi < 0) return 0;
  if (val <= pts[0][key]) return pts[0][out];
  if (val >= pts[hi][key]) return pts[hi][out];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid][key] <= val) lo = mid; else hi = mid;
  }
  const a = pts[lo], b = pts[hi], span = b[key] - a[key];
  return span ? a[out] + ((b[out] - a[out]) * (val - a[key])) / span : a[out];
}

function syncScroll(from) {
  if (!state.editing) return;
  viewMap ??= buildViewMap();
  editMap ??= buildEditMap();
  const [src, dst] = from === "editor" ? [editor, viewer] : [viewer, editor];
  // 맨 위·맨 아래는 그대로 맞춘다 (머리 여백과 마지막 줄 처리)
  if (src.scrollTop <= 0) { dst.scrollTop = 0; return; }
  if (src.scrollTop >= src.scrollHeight - src.clientHeight - 1) { dst.scrollTop = dst.scrollHeight; return; }
  if (from === "editor") {
    const line = interp(editMap, "y", editor.scrollTop, "line");
    viewer.scrollTop = interp(viewMap, "line", line, "y");
  } else {
    const line = interp(viewMap, "y", viewer.scrollTop, "line");
    editor.scrollTop = interp(editMap, "line", line, "y");
  }
}

// 위치표가 낡는 경우: 창·패널 크기 변경, 이미지 로드, 접기 블록 열고 닫기, 원문 입력
new ResizeObserver(() => { invalidateViewMap(); invalidateEditMap(); }).observe(viewer);
new ResizeObserver(() => invalidateEditMap()).observe(editor);
content.addEventListener("load", invalidateViewMap, true);
content.addEventListener("toggle", invalidateViewMap, true);
editor.addEventListener("input", invalidateEditMap);

// ── 뷰어/편집기 폭 조절 막대 ──
const splitter = $("splitter");
const SPLIT_MIN = 25, SPLIT_MAX = 75;
function setSplit(pct, remember = true) {
  const v = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, pct));
  app.style.setProperty("--split", `${v}%`);
  splitter.setAttribute("aria-valuenow", String(Math.round(v)));
  if (remember) store.set("split", v);
}
setSplit(store.get("split", 46), false);
splitter.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  splitter.setPointerCapture(e.pointerId);
  app.classList.add("resizing");
});
splitter.addEventListener("pointermove", (e) => {
  if (!splitter.hasPointerCapture(e.pointerId)) return;
  const r = splitter.parentElement.getBoundingClientRect();
  setSplit(((r.right - e.clientX) / r.width) * 100);
});
splitter.addEventListener("pointerup", (e) => {
  splitter.releasePointerCapture(e.pointerId);
  app.classList.remove("resizing");
});
splitter.addEventListener("dblclick", () => setSplit(46)); // 두 번 누르면 기본 폭
splitter.addEventListener("keydown", (e) => {
  const cur = parseFloat(app.style.getPropertyValue("--split")) || 46;
  if (e.key === "ArrowLeft") { e.preventDefault(); setSplit(cur + 4); }
  if (e.key === "ArrowRight") { e.preventDefault(); setSplit(cur - 4); }
});

editor.addEventListener("input", () => {
  state.raw = editor.value;
  setDirty(state.raw !== state.savedRaw);
  schedulePreview();
});

editor.addEventListener("keydown", (e) => {
  if (e.key === "Tab" && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    if (e.shiftKey) {
      // 현재 줄 앞의 공백 2칸 제거
      const { selectionStart: s, value: v } = editor;
      const lineStart = v.lastIndexOf("\n", s - 1) + 1;
      if (v.startsWith("  ", lineStart)) {
        editor.setSelectionRange(lineStart, lineStart + 2);
        document.execCommand("delete");
        editor.setSelectionRange(Math.max(lineStart, s - 2), Math.max(lineStart, s - 2));
      }
    } else {
      document.execCommand("insertText", false, "  "); // 실행 취소 기록 유지
    }
  }
});

async function save() {
  if (!state.doc) return;
  if (state.editing) state.raw = editor.value;
  if (state.raw === state.savedRaw && !state.conflict) {
    toast("이미 저장되어 있어요");
    return;
  }
  try {
    await invoke("save_file", { path: state.doc.path, content: state.raw });
    state.savedRaw = state.raw;
    state.doc.raw = state.raw;
    state.doc.html = state.editing ? "" : state.html; // 보기 모드로 돌아갈 때 다시 렌더
    hideBanner();
    setDirty(false);
    toast("저장했어요");
  } catch (e) {
    toast(String(e));
  }
}

// ───────────────────────── 외부 변경 알림 ─────────────────────────

function showBanner() {
  state.conflict = true;
  $("banner").classList.add("open");
}
function hideBanner() {
  state.conflict = false;
  $("banner").classList.remove("open");
}
$("banner-ignore").addEventListener("click", hideBanner);
$("banner-reload").addEventListener("click", async () => {
  if (!state.doc) return;
  try {
    const doc = await invoke("open_file", { path: state.doc.path });
    await loadDoc(doc, { keepScroll: true });
    toast("새 내용을 불러왔어요");
  } catch (e) { toast(String(e)); }
});

// ───────────────────────── 찾기 ─────────────────────────

const search = {
  el: $("search"),
  input: $("search-input"),
  count: $("search-count"),
  open: false,
  hits: [],     // 보기 모드: <mark> 목록, 편집 모드: [start, end]
  index: -1,

  show() {
    if (!state.doc) return;
    this.open = true;
    this.el.classList.add("open");
    const sel = String(window.getSelection?.() ?? "").trim();
    if (sel && !sel.includes("\n") && !state.editing) this.input.value = sel;
    this.input.focus();
    this.input.select();
    this.run(this.input.value);
  },
  close() {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove("open");
    this.clear();
    this.count.textContent = "";
    (state.editing ? editor : viewer).focus({ preventScroll: true });
  },
  clear() {
    content.querySelectorAll("mark.hit").forEach((m) => m.replaceWith(document.createTextNode(m.textContent)));
    content.normalize();
    this.hits = [];
    this.index = -1;
  },
  run(q, { keepIndex = false } = {}) {
    const prev = this.index;
    this.clear();
    const query = q.trim() ? q : "";
    if (query) {
      if (state.editing) this.findInEditor(query);
      else this.findInView(query);
    }
    this.index = this.hits.length ? (keepIndex && prev >= 0 ? Math.min(prev, this.hits.length - 1) : 0) : -1;
    this.el.classList.toggle("miss", !!query && !this.hits.length);
    this.focusHit(!keepIndex);
  },
  findInView(query) {
    const needle = query.toLowerCase();
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p || p.closest(".mermaid-block, .katex-mathml, .t-codep__head")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const text = node.nodeValue;
      const lower = text.toLowerCase();
      if (lower.length !== text.length) continue; // 대소문자 변환으로 길이가 바뀌는 드문 문자 대비
      let i = lower.indexOf(needle);
      if (i < 0) continue;
      const frag = document.createDocumentFragment();
      let last = 0;
      while (i >= 0) {
        frag.append(text.slice(last, i));
        const mark = document.createElement("mark");
        mark.className = "hit";
        mark.textContent = text.slice(i, i + needle.length);
        frag.append(mark);
        this.hits.push(mark);
        last = i + needle.length;
        i = lower.indexOf(needle, last);
      }
      frag.append(text.slice(last));
      node.replaceWith(frag);
    }
  },
  findInEditor(query) {
    const v = editor.value.toLowerCase();
    const needle = query.toLowerCase();
    let i = v.indexOf(needle);
    while (i >= 0) { this.hits.push([i, i + needle.length]); i = v.indexOf(needle, i + needle.length); }
  },
  focusHit(scroll = true) {
    const total = this.hits.length;
    this.count.textContent = this.input.value.trim() ? `${total ? this.index + 1 : 0}/${total}` : "";
    if (!total) return;
    if (state.editing) {
      const [s, e] = this.hits[this.index];
      if (!scroll) return;
      // 텍스트영역은 선택 위치로 스크롤하려면 잠깐 포커스가 필요하다
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(s, e);
      const line = editor.value.slice(0, s).split("\n").length;
      const lh = parseFloat(getComputedStyle(editor).lineHeight) || 24;
      editor.scrollTop = Math.max(0, line * lh - editor.clientHeight / 2);
      this.input.focus();
      return;
    }
    this.hits.forEach((m, i) => m.classList.toggle("current", i === this.index));
    if (scroll) this.hits[this.index].scrollIntoView({ block: "center", behavior: "smooth" });
  },
  step(dir) {
    if (!this.hits.length) return;
    this.index = (this.index + dir + this.hits.length) % this.hits.length;
    this.focusHit();
  },
};

let searchTimer;
search.input.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => search.run(search.input.value), 80);
});
search.input.addEventListener("keydown", (e) => {
  if (e.isComposing) return; // 한글 조합 중 Enter 무시
  if (e.key === "Enter") { e.preventDefault(); search.step(e.shiftKey ? -1 : 1); }
  else if (e.key === "Escape") { e.preventDefault(); search.close(); }
});
$("search-next").addEventListener("click", () => search.step(1));
$("search-prev").addEventListener("click", () => search.step(-1));
$("search-close").addEventListener("click", () => search.close());

// ───────────────────────── 글자 크기 ─────────────────────────

const FONT_BASE = 16, FONT_MIN = 11, FONT_MAX = 30;
let fontSize = store.get("fontSize", FONT_BASE);
function setFont(px) {
  fontSize = Math.min(FONT_MAX, Math.max(FONT_MIN, px));
  // 문서 본문 글자는 px 고정값이라 크기는 본문 영역 zoom으로 바꾼다 (16px = 1배)
  document.documentElement.style.setProperty("--doc-zoom", String(fontSize / FONT_BASE));
  invalidateViewMap();
  invalidateEditMap();
  store.set("fontSize", fontSize);
}

// ───────────────────────── 링크 ─────────────────────────

content.addEventListener("click", (e) => {
  const a = e.target.closest("a[href]");
  if (!a) return;
  const href = a.getAttribute("href");
  e.preventDefault();
  if (href.startsWith("#")) {
    const id = decodeURIComponent(href.slice(1));
    const target = document.getElementById(id) || content.querySelector(`[name="${CSS.escape(id)}"]`);
    if (target) scrollToEl(target);
    return;
  }
  if (/^(https?:|mailto:|tel:)/i.test(href)) {
    T?.opener.openUrl(href).catch((err) => toast(String(err)));
    return;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^[a-z]:[\\/]/i.test(href)) return; // 그 밖의 스킴은 무시
  // 다른 마크다운 문서로 가는 상대 링크
  const [file] = href.split(/[?#]/);
  if (!state.doc || !MD_RE.test(file)) { toast("마크다운 문서 링크만 열 수 있어요"); return; }
  const decoded = decodeURIComponent(file);
  openPath(isAbsPath(decoded) ? decoded : `${state.doc.dir}/${decoded}`);
});

// ───────────────────────── 단축키 ─────────────────────────

document.addEventListener("keydown", (e) => {
  const mod = IS_MAC ? e.metaKey : e.ctrlKey;
  if (e.key === "Escape" && search.open) { e.preventDefault(); search.close(); return; }
  if (!mod || e.altKey) return;
  // 한글 자판에서도 동작하도록 e.key 대신 물리 키(e.code)를 본다
  switch (e.code) {
    case "KeyE": e.preventDefault(); toggleEdit(); break;
    case "KeyS": e.preventDefault(); save(); break;
    case "KeyO": e.preventDefault(); openDialog(); break;
    case "KeyF": e.preventDefault(); search.show(); break;
    case "Backslash": e.preventDefault(); if (state.doc) setTocOpen(app.classList.contains("toc-hidden")); break;
    case "Equal": case "NumpadAdd": e.preventDefault(); setFont(fontSize + 1); break;
    case "Minus": case "NumpadSubtract": e.preventDefault(); setFont(fontSize - 1); break;
    case "Digit0": case "Numpad0": e.preventDefault(); setFont(FONT_BASE); toast("글자 크기를 처음으로 돌렸어요"); break;
  }
});

// ───────────────────────── 버튼 ─────────────────────────

$("btn-open").addEventListener("click", openDialog);
$("btn-open-empty").addEventListener("click", openDialog);
$("btn-search").addEventListener("click", () => (search.open ? search.close() : search.show()));
$("btn-toc").addEventListener("click", () => setTocOpen(app.classList.contains("toc-hidden")));
$("seg-view").addEventListener("click", () => toggleEdit(false));
$("seg-edit").addEventListener("click", () => toggleEdit(true));
$("btn-save").addEventListener("click", save);
$("btn-edit-close").addEventListener("click", () => toggleEdit(false));
document.querySelectorAll("kbd[data-mod]").forEach((k) => (k.textContent = `${MOD_LABEL}${IS_MAC ? "" : "+"}${k.textContent}`));

// 시스템 테마가 바뀌면 Mermaid 색을 다시 맞춘다
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  applyTheme();
  if (state.doc && content.querySelector(".mermaid-block")) showHtml(state.html, { keepScroll: true });
});

// ───────────────────────── Tauri 연동 ─────────────────────────

async function boot() {
  setFont(fontSize);
  setTocOpen(isNarrow() ? false : store.get("tocOpen", true), { remember: false });
  updateChrome();
  // 첫 화면이 자리 잡은 뒤부터 사이드바·본문 이동 애니메이션을 켠다
  const enableAnim = () => requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove("no-anim")));

  if (!T) {
    // 브라우저에서 index.html만 열었을 때(디자인 확인용)
    window.__graphiteDemo = (doc) => { const done = loadDoc(doc); enableAnim(); return done; };
    return;
  }
  const { listen } = T.event;
  const win = T.window.getCurrentWindow();

  // 감시 스레드 이벤트
  await listen("file-reloaded", async ({ payload: doc }) => {
    if (!state.doc || doc.path !== state.doc.path) return;
    if (state.editing || state.dirty) { showBanner(); return; } // 혹시 모를 경합 대비 이중 확인
    state.doc = doc;
    state.raw = state.savedRaw = doc.raw;
    await showHtml(doc.html, { keepScroll: true });
  });
  await listen("file-conflict", ({ payload }) => {
    if (state.doc && payload === state.doc.path) showBanner();
  });
  await listen("file-missing", ({ payload }) => {
    if (state.doc && payload === state.doc.path) toast("파일이 옮겨졌거나 지워졌어요");
  });
  // macOS: 앱이 떠 있는 상태에서 Finder로 다른 파일을 열었을 때
  await listen("open-path", ({ payload }) => openPath(payload));

  // 드래그 앤 드롭
  const drop = $("drop");
  await T.webview.getCurrentWebview().onDragDropEvent(async ({ payload }) => {
    if (payload.type === "enter" || payload.type === "over") drop.classList.add("show");
    else if (payload.type === "leave") drop.classList.remove("show");
    else if (payload.type === "drop") {
      drop.classList.remove("show");
      const md = payload.paths.find((p) => MD_RE.test(p)) ?? payload.paths[0];
      if (md && (await invoke("is_markdown", { path: md }))) openPath(md);
      else toast("마크다운 파일(.md)만 열 수 있어요");
    }
  });

  // 저장 안 한 채로 창을 닫으려 할 때
  await win.onCloseRequested(async (e) => {
    if (!state.dirty) return;
    const ok = await T.dialog.ask("저장하지 않은 변경이 있어요. 그래도 닫을까요?", {
      title: "Graphite", kind: "warning", okLabel: "닫기", cancelLabel: "취소",
    });
    if (!ok) e.preventDefault();
  });

  // CLI 인자 / 파일 연결로 넘어온 문서를 바로 그리고 창을 띄운다.
  // 본문은 동기적으로 붙고, 수식·다이어그램·하이라이트는 창이 뜬 뒤 이어서 채워진다.
  try {
    const doc = await invoke("take_launch_doc");
    if (doc) loadDoc(doc);
  } catch (e) {
    toast(String(e));
  }
  requestAnimationFrame(() => { win.show().catch(() => {}); enableAnim(); });
}

boot();
