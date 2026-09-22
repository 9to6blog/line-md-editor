import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  drawSelection,
  highlightSpecialChars,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  undo,
  redo,
  indentWithTab,
} from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import {
  syntaxHighlighting,
  HighlightStyle,
  bracketMatching,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { search, searchKeymap, openSearchPanel } from "@codemirror/search";
import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import { icon, logo } from "./icons";
const api = window.notes,
  $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let state,
  view,
  mode = "split",
  inspector = "Outline",
  settingsTab = "Appearance",
  syncBusy = false,
  toastTimer,
  saveTimer,
  pending = new Map(),
  saveChain = Promise.resolve(),
  headings = [],
  fonts = [],
  searchQuery = "",
  collapsed = new Set(),
  currentFilter = "All Notes";
const cachedStates = new Map(),
  wrapCompartment = new Compartment();
const current = () =>
  state.docs.find((d) => d.id === state.active) || state.docs[0];
const syntax = HighlightStyle.define([
  {
    tag: [tags.heading, tags.heading1, tags.heading2, tags.heading3],
    color: "#0049ff",
    fontWeight: "bold",
    fontSize: "1.12em",
  },
  { tag: tags.processingInstruction, color: "#6f8db8" },
  { tag: tags.meta, color: "#2c80f0" },
  { tag: [tags.quote, tags.comment], color: "#7e879e" },
  { tag: [tags.url, tags.link], color: "#0c83a9" },
  { tag: tags.string, color: "#c65465" },
  { tag: tags.keyword, color: "#ab27d0" },
  { tag: tags.monospace, color: "#1c876b" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.list, color: "#2771ed" },
  { tag: tags.content, color: "#27304a" },
]);
const darkSyntax = HighlightStyle.define([
  {
    tag: [tags.heading, tags.heading1, tags.heading2],
    color: "#80a6ff",
    fontWeight: "bold",
    fontSize: "1.12em",
  },
  { tag: [tags.quote, tags.comment], color: "#929eb7" },
  { tag: tags.meta, color: "#82c4f5" },
  { tag: tags.monospace, color: "#83d5bc" },
  { tag: tags.string, color: "#eb9ca5" },
  { tag: tags.keyword, color: "#e7a1f4" },
]);
const syntaxCompartment = new Compartment();
function tool(name, label, action = name, extra = "") {
  return `<button class="tool ${extra}" data-action="${action}" title="${esc(label)}" aria-label="${esc(label)}">${icon(name)}<span class="tool-label">${label}</span>${["heading", "export"].includes(name) ? icon("down", "chevron") : ""}</button>`;
}
function drawShell() {
  $("#app").innerHTML =
    `<div class="shell"><header class="titlebar"><div class="brand">${logo}<span>Notes</span></div><span class="tagline">Write. Organize. Think better.</span><div class="window-controls"><button data-window="minimize" aria-label="Minimize">${icon("minus")}</button><button data-window="maximize" aria-label="Maximize">${icon("maximize")}</button><button data-window="close" aria-label="Close window">${icon("close")}</button></div></header>
 <nav class="toolbar" aria-label="Editor toolbar"><div class="tool-group">${tool("new", "New", "new", "new")}<i class="separator"></i>${tool("folder", "Open", "open")}${tool("save", "Save")}<i class="separator"></i>${tool("undo", "Undo")}${tool("redo", "Redo")}<i class="separator"></i></div><div class="tool-group">${tool("bold", "Bold")}${tool("italic", "Italic")}${tool("heading", "Heading")}${tool("list", "List")}${tool("check", "Checklist", "check")}${tool("code", "Code")}${tool("link", "Link")}${tool("image", "Image")}${tool("table", "Table")}${tool("quote", "Quote")}<i class="separator"></i></div><div class="tool-group">${tool("split", "Split View", "split", "active")}${tool("preview", "Preview")}<i class="separator"></i>${tool("search", "Search")}${tool("export", "Export")}${tool("settings", "Settings")}<i class="separator"></i><button class="tool" data-action="theme" title="Toggle theme" aria-label="Toggle theme">${icon("moon")}</button></div></nav>
 <main class="workspace"><aside class="sidebar" aria-label="Workspace"></aside><section class="document-area"><div class="tabs" role="tablist" aria-label="Open documents"></div><div class="panes split"><div class="editor-pane" aria-label="Markdown editor"></div><div class="divider" role="separator" aria-label="Resize editor and preview" aria-orientation="vertical" tabindex="0"></div><div class="preview-pane"><button class="preview-anchor" data-action="copy-link" aria-label="Copy note title">${icon("link")}</button><article class="markdown" id="preview"></article></div></div></section><aside class="inspector"><div class="inspector-tabs">${["Outline", "Stats", "Export"].map((x) => `<button class="inspector-tab ${x === inspector ? "active" : ""}" data-inspector="${x}">${x}</button>`).join("")}</div><div class="inspector-content"></div><div class="motivation">${icon("settings")}<span>Small notes.<br>Big progress.</span></div></aside></main>
 <footer class="statusbar"><span class="status-ready"><i class="status-dot"></i><span id="save-status">Ready</span></span><button class="sync-status" data-action="sync" title="Sync workspace">${icon("sync")}<span id="sync-text">Sync not connected</span></button><div class="status-right"><span id="cursor-status">Ln 1, Col 1</span><i class="vline"></i><span id="word-count"></span><i class="vline"></i><span id="read-time"></span><i class="vline"></i><span>UTF-8</span><i class="vline"></i><span>Markdown</span><div class="zoom-control"><button data-action="zoom-out" aria-label="Zoom out">${icon("minus")}</button><span id="zoom-value">100%</span><button data-action="zoom-in" aria-label="Zoom in">${icon("plus")}</button></div></div></footer></div>`;
  bindShell();
  drawSidebar();
  drawTabs();
  createEditor();
  renderPreview();
  applySettings();
  updateStatus();
}
function row(name, ico, count, filter, extra = "") {
  return `<button class="nav-row ${filter === currentFilter ? "active" : ""} ${extra}" data-filter="${esc(filter)}">${icon(ico, filter === "All Notes" ? "blue" : "")}<span class="label">${esc(name)}</span><span class="count">${count}</span></button>`;
}
function fileRow(doc) {
  return `<button class="nav-row ${doc.id === state.active ? "file-active" : ""}" data-doc="${esc(doc.id)}" title="${esc(doc.path || doc.name)}">${icon("file")}<span class="label">${esc(doc.name)}</span></button>`;
}
function section(title, ico, body) {
  return `<section class="section ${collapsed.has(title) ? "collapsed" : ""}"><button class="section-heading" data-collapse="${title}">${icon(ico, ico)}<span>${title}</span>${icon(collapsed.has(title) ? "down" : "up", "end")}</button><div class="section-body">${body}</div></section>`;
}
function drawSidebar() {
  const docs = state.docs.filter((d) => !d.trash && !d.archived),
    allTags = [
      ...new Set([
        "productivity",
        "ideas",
        "development",
        "personal",
        "notes",
        ...docs.flatMap((d) => d.tags || []),
      ]),
    ];
  const recent = [
    ...state.tabs.map((id) => docs.find((d) => d.id === id)).filter(Boolean),
    ...docs,
  ].filter((d, i, a) => a.findIndex((x) => x.id === d.id) === i);
  // Keep the reference's initial recent-file order, then bring new documents to the top.
  const sampleOrder = [
    "sample-1",
    "sample-2",
    "sample-3",
    "sample-4",
    "sample-5",
  ];
  const displayed = state.docs.some((d) => !d.id.startsWith("sample-"))
    ? recent
    : sampleOrder.map((id) => docs.find((d) => d.id === id)).filter(Boolean);
  $(".sidebar").innerHTML =
    section(
      "Workspace",
      "workspace",
      row("All Notes", "workspace", docs.length, "All Notes") +
        ["Personal", "Projects", "Learning"]
          .map((x, i) =>
            row(
              x,
              ["file", "project", "book"][i],
              docs.filter((d) => d.folders?.includes(x)).length,
              x,
            ),
          )
          .join("") +
        row(
          "Archive",
          "archive",
          state.docs.filter((d) => d.archived && !d.trash).length,
          "Archive",
        ) +
        row(
          "Trash",
          "trash",
          state.docs.filter((d) => d.trash).length,
          "Trash",
        ),
    ) +
    section(
      "Recent Files",
      "clock",
      displayed.slice(0, 5).map(fileRow).join(""),
    ) +
    section(
      "Favorites",
      "star",
      docs
        .filter((d) => d.favorite)
        .map(fileRow)
        .join("") || '<div class="empty">Star a note to keep it here.</div>',
    ) +
    section(
      "Tags",
      "tag",
      allTags
        .map((t) =>
          row(
            t,
            "hash",
            docs.filter((d) => d.tags?.includes(t)).length,
            "tag:" + t,
            "tag-row",
          ),
        )
        .join("") +
        '<button class="nav-row tag-row" data-action="add-tag">' +
        icon("plus") +
        "<span>Add tag</span></button>",
    );
}
function drawTabs() {
  $(".tabs").innerHTML =
    state.tabs
      .map((id) => state.docs.find((d) => d.id === id))
      .filter(Boolean)
      .map(
        (d) =>
          `<div class="tab ${d.id === state.active ? "active" : ""}" role="tab" aria-selected="${d.id === state.active}" tabindex="0" data-tab="${d.id}" title="${esc(d.path || d.name)}">${icon("file")}<span class="tab-label">${esc(d.name)}${d.path && d.content !== d.savedContent ? " •" : ""}</span><button class="tab-close" data-close-tab="${d.id}" aria-label="Close ${esc(d.name)}">${icon("close")}</button></div>`,
      )
      .join("") +
    `<button class="new-tab" data-action="new" aria-label="New tab">${icon("plus")}</button>`;
}
function editorExtensions() {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    bracketMatching(),
    markdown({ codeLanguages: languages }),
    syntaxCompartment.of(syntaxHighlighting(isDark() ? darkSyntax : syntax)),
    search({ top: true }),
    wrapCompartment.of(state.settings.wordWrap ? EditorView.lineWrapping : []),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab,
    ]),
    EditorView.contentAttributes.of({
      "aria-label": "Markdown source",
      spellcheck: "false",
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        current().content = update.state.doc.toString();
        queueSave(current().id, { content: current().content });
        renderPreview();
        drawTabs();
      }
      if (update.docChanged || update.selectionSet) updateStatus();
    }),
  ];
}
function createEditor() {
  view = new EditorView({
    state: EditorState.create({
      doc: current()?.content || "",
      extensions: editorExtensions(),
    }),
    parent: $(".editor-pane"),
  });
  view.scrollDOM.addEventListener("scroll", () => {
    if (!state.settings.syncScroll || scrollLock || mode !== "split") return;
    scrollLock = true;
    const p = $(".preview-pane");
    p.scrollTop =
      (view.scrollDOM.scrollTop /
        Math.max(
          1,
          view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight,
        )) *
      (p.scrollHeight - p.clientHeight);
    requestAnimationFrame(() => (scrollLock = false));
  });
}
let scrollLock = false;
function queueSave(id, patch) {
  pending.set(id, { ...pending.get(id), ...patch });
  $("#save-status").textContent = "Saving…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => flush().catch(error), 300);
}
async function flush() {
  clearTimeout(saveTimer);
  const batch = [...pending.entries()];
  pending.clear();
  saveChain = saveChain
    .catch(() => {})
    .then(async () => {
      for (const [id, patch] of batch) {
        try {
          await api.update(id, patch);
        } catch (e) {
          pending.set(id, { ...patch, ...pending.get(id) });
          throw e;
        }
      }
    });
  await saveChain;
  if ($("#save-status"))
    $("#save-status").textContent =
      current()?.path && current().content !== current().savedContent
        ? "Draft saved"
        : "Ready";
}
async function activate(id) {
  if (!state.docs.some((d) => d.id === id)) return;
  await flush();
  if (view && state.active) cachedStates.set(state.active, view.state);
  state.active = id;
  if (!state.tabs.includes(id)) state.tabs.push(id);
  const saved = cachedStates.get(id);
  view.setState(
    saved && saved.doc.toString() === current().content
      ? saved
      : EditorState.create({
          doc: current().content,
          extensions: editorExtensions(),
        }),
  );
  await api.session(state.tabs, id);
  drawTabs();
  drawSidebar();
  renderPreview();
  updateStatus();
  applySettings();
}
async function newNote() {
  await flush();
  const d = await api.create("Untitled.md", "");
  state.docs.unshift(d);
  await activate(d.id);
  view.focus();
}
async function closeTab(id) {
  await flush();
  state.tabs = state.tabs.filter((x) => x !== id);
  if (state.active === id) {
    if (!state.tabs.length) {
      await newNote();
      return;
    }
    await activate(state.tabs.at(-1));
  }
  await api.session(state.tabs, state.active);
  drawTabs();
}
function renderPreview() {
  const doc = current();
  if (!doc) return;
  let html = marked.parse(doc.content, { gfm: true, breaks: false });
  html = DOMPurify.sanitize(html, {
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["style", "form", "iframe", "video", "audio"],
    FORBID_ATTR: ["style"],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|file):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  });
  $("#preview").innerHTML = html;
  headings = [];
  $$("#preview h1,#preview h2,#preview h3,#preview h4").forEach((h, i) => {
    h.id = "heading-" + i;
    headings.push({
      text: h.textContent,
      level: Number(h.tagName[1]),
      id: h.id,
    });
  });
  $$("#preview pre code").forEach((code) => {
    const lang = code.className.match(/language-([\w+-]+)/)?.[1] || "text";
    if (hljs.getLanguage(lang))
      code.innerHTML = hljs.highlight(code.textContent, {
        language: lang,
      }).value;
    const label = document.createElement("span");
    label.className = "code-label";
    label.textContent = lang;
    code.parentElement.append(label);
    const button = document.createElement("button");
    button.className = "copy-code";
    button.setAttribute("aria-label", "Copy code");
    button.innerHTML = icon("copy");
    button.onclick = () =>
      navigator.clipboard
        .writeText(code.textContent)
        .then(() => toast("Code copied"));
    code.parentElement.append(button);
  });
  $$("#preview input[type=checkbox]").forEach((input, i) => {
    input.disabled = false;
    input.setAttribute("aria-label", input.parentElement.textContent.trim());
    input.addEventListener("change", () => {
      let n = -1;
      const content = view.state.doc
        .toString()
        .replace(/^(\s*(?:[-*+]\s+)?)\[([ xX])\]/gm, (m, p) =>
          ++n === i ? p + "[" + (input.checked ? "x" : " ") + "]" : m,
        );
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
      });
    });
  });
  $$("#preview img").forEach((img) => {
    const src = img.getAttribute("src");
    if (src && !/^(https?:|data:|file:)/i.test(src) && doc.path) {
      try {
        img.src = new URL(
          src,
          "file:///" + doc.path.replaceAll("\\", "/"),
        ).href;
      } catch {}
    }
  });
  $$("#preview a").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const href = a.getAttribute("href");
      if (href?.startsWith("#")) {
        const found = headings.find(
          (h) => h.text.toLowerCase().replace(/\s+/g, "-") === href.slice(1),
        );
        if (found) $("#" + found.id).scrollIntoView({ behavior: "smooth" });
      } else if (/^https?:/.test(href || "")) api.external(href);
    }),
  );
  drawInspector();
  updateStatus();
}
function wordCount() {
  return (
    current()?.content.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []
  ).length;
}
function drawInspector() {
  $$(".inspector-tab").forEach((b) =>
    b.classList.toggle("active", b.dataset.inspector === inspector),
  );
  const panel = $(".inspector-content");
  if (inspector === "Outline")
    panel.innerHTML =
      headings
        .map(
          (h, i) =>
            `<button class="outline-item ${i > 0 && h.level > 1 ? "child" : ""}" data-heading="${h.id}" title="${esc(h.text)}">${i === 0 ? icon("quote") : ""}<span>${esc(h.text)}</span></button>`,
        )
        .join("") ||
      '<div class="empty">Add a heading to see<br>your document outline.</div>';
  if (inspector === "Stats") {
    const text = current()?.content || "";
    panel.innerHTML =
      [
        ["Words", wordCount()],
        ["Characters", text.length],
        ["Lines", text.split("\n").length],
        ["Headings", headings.length],
        ["Reading time", Math.max(1, Math.ceil(wordCount() / 220)) + " min"],
      ]
        .map(
          ([k, v]) =>
            `<div class="stat-card"><span>${k}</span><strong>${v}</strong></div>`,
        )
        .join("") +
      `<div class="notice">${esc(current()?.name)}<br>UTF-8 · Markdown</div><button class="secondary" data-action="organize">${icon("tag")} Organize note</button>`;
  }
  if (inspector === "Export")
    panel.innerHTML = ["pdf", "html", "md"]
      .map(
        (x) =>
          `<button class="export-card" data-export="${x}">${icon(x === "md" ? "file" : "export")}<span>${x === "md" ? "Markdown" : x.toUpperCase()}<br><small class="setting-help">Save a copy</small></span></button>`,
      )
      .join("");
}
function updateStatus() {
  if (!view || !$("#cursor-status")) return;
  const pos = view.state.selection.main.head,
    line = view.state.doc.lineAt(pos);
  $("#cursor-status").textContent =
    `Ln ${line.number}, Col ${pos - line.from + 1}`;
  $("#word-count").textContent = wordCount() + " words";
  $("#read-time").textContent =
    Math.max(1, Math.ceil(wordCount() / 220)) + " min read";
  $("#zoom-value").textContent = state.settings.zoom + "%";
  $("#sync-text").textContent = syncBusy
    ? "Syncing…"
    : state.settings.lastSync
      ? "Synced " +
        (Date.now() - state.settings.lastSync < 60000
          ? "just now"
          : new Date(state.settings.lastSync).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }))
      : state.settings.syncProvider === "none"
        ? "Sync not connected"
        : "Ready to sync";
  $(".sync-status .icon").classList.toggle("spinning", syncBusy);
}
function isDark() {
  return (
    state?.settings.theme === "dark" ||
    (state?.settings.theme === "system" &&
      matchMedia("(prefers-color-scheme:dark)").matches)
  );
}
function applySettings() {
  const s = state.settings;
  document.documentElement.dataset.theme = isDark() ? "dark" : "light";
  const r = document.documentElement.style;
  r.setProperty("--editor-font", `"${s.editorFont.replaceAll('"', "")}"`);
  r.setProperty("--preview-font", `"${s.previewFont.replaceAll('"', "")}"`);
  r.setProperty("--editor-size", (s.fontSize * s.zoom) / 100 + "px");
  r.setProperty("--preview-size", (s.previewSize * s.zoom) / 100 + "px");
  r.setProperty(
    "--toolbar",
    isDark()
      ? `rgba(28,37,55,${s.glass / 100})`
      : `rgba(255,255,255,${s.glass / 100})`,
  );
  r.setProperty(
    "--panel",
    isDark()
      ? `rgba(25,33,50,${s.glass / 100})`
      : `rgba(255,255,255,${s.glass / 100})`,
  );
  if (view)
    view.dispatch({
      effects: [
        wrapCompartment.reconfigure(s.wordWrap ? EditorView.lineWrapping : []),
        syntaxCompartment.reconfigure(
          syntaxHighlighting(isDark() ? darkSyntax : syntax),
        ),
      ],
    });
  $("[data-action=theme]").innerHTML = icon(isDark() ? "sun" : "moon");
  updateStatus();
}
async function setSettings(patch) {
  state.settings = await api.settings(patch);
  applySettings();
}
async function loadFont(font) {
  try {
    const face = new FontFace(font.family, `url("${font.url}")`);
    await face.load();
    document.fonts.add(face);
  } catch {
    toast("Could not load font: " + font.name);
  }
}
function toast(message) {
  $(".toast")?.remove();
  clearTimeout(toastTimer);
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = message;
  document.body.append(el);
  toastTimer = setTimeout(() => el.remove(), 5000);
}
function error(e) {
  console.error(e);
  toast(
    (e.message || String(e)).replace(
      /^Error invoking remote method '[^']+': Error: /,
      "",
    ),
  );
  if ($("#save-status"))
    $("#save-status").textContent = pending.size
      ? "Save failed — retry"
      : "Ready";
}
function closeModal() {
  $(".modal-backdrop")?.remove();
}
function modal(title, body, { nav = "", width = 660 } = {}) {
  closeModal();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}" style="width:${width}px"><div class="modal-header">${icon(title === "Settings" ? "settings" : "file")}<h2>${esc(title)}</h2><button class="close-modal" aria-label="Close dialog">${icon("close")}</button></div>${nav}<div class="modal-body">${body}</div></section>`;
  document.body.append(backdrop);
  backdrop.querySelector(".close-modal").onclick = closeModal;
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });
  backdrop.querySelector("input,button,select")?.focus();
  return backdrop;
}
function setting(label, help, input) {
  return `<div class="setting-row"><div><span class="setting-label">${label}</span><p class="setting-help">${help}</p></div><div class="setting-input">${input}</div></div>`;
}
function fontOptions(value) {
  const names = [
    ...new Set([
      value,
      "Segoe UI",
      "Consolas",
      "Malgun Gothic",
      "Arial",
      "Georgia",
      "Cascadia Code",
      ...fonts,
    ]),
  ];
  return (
    names
      .map(
        (f) =>
          `<option value="${esc(f)}" ${f === value ? "selected" : ""}>${esc(f)}</option>`,
      )
      .join("") +
    state.customFonts
      .map(
        (f) =>
          `<option value="${f.family}" ${f.family === value ? "selected" : ""}>${esc(f.name)} (imported)</option>`,
      )
      .join("")
  );
}
async function showSettings(tab = settingsTab) {
  settingsTab = tab;
  const s = state.settings;
  let body = "";
  if (tab === "Appearance")
    body =
      setting(
        "Theme",
        "Choose the look of your workspace.",
        `<div class="segmented">${["light", "dark", "system"].map((t) => `<button data-theme-choice="${t}" class="${s.theme === t ? "active" : ""}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div>`,
      ) +
      setting(
        "Window opacity",
        "Real window transparency, including on Windows 10.",
        `<input aria-label="Window opacity" data-setting="opacity" type="range" min="70" max="100" value="${s.opacity}"><output>${s.opacity}%</output>`,
      ) +
      setting(
        "Glass surface",
        "Transparency of the toolbar and side panel.",
        `<input aria-label="Glass surface" data-setting="glass" type="range" min="20" max="100" value="${s.glass}"><output>${s.glass}%</output>`,
      ) +
      setting(
        "Reading font",
        "Font used in the Markdown preview.",
        `<select class="field" data-setting="previewFont" aria-label="Reading font">${fontOptions(s.previewFont)}</select>`,
      ) +
      setting(
        "Reading size",
        "Adjust preview text size.",
        `<input class="field" aria-label="Reading size" data-setting="previewSize" type="number" min="10" max="32" value="${s.previewSize}" style="width:75px">`,
      );
  if (tab === "Editor")
    body =
      setting(
        "Editor font",
        "Use any installed font, including Korean fonts.",
        `<select class="field" data-setting="editorFont" aria-label="Editor font">${fontOptions(s.editorFont)}</select>`,
      ) +
      setting(
        "Font size",
        "Size of the Markdown source text.",
        `<input class="field" aria-label="Font size" data-setting="fontSize" type="number" min="10" max="32" value="${s.fontSize}" style="width:75px">`,
      ) +
      setting(
        "Word wrap",
        "Keep long lines inside the editor.",
        `<input type="checkbox" aria-label="Word wrap" data-setting="wordWrap" ${s.wordWrap ? "checked" : ""}>`,
      ) +
      setting(
        "Synchronized scrolling",
        "Keep source and preview at the same position.",
        `<input type="checkbox" aria-label="Synchronized scrolling" data-setting="syncScroll" ${s.syncScroll ? "checked" : ""}>`,
      ) +
      setting(
        "Import a font",
        "Add a .ttf, .otf, .woff, or .woff2 font to Notes.",
        `<button class="secondary" id="import-font">${icon("plus")} Import font</button>`,
      ) +
      `<div class="notice">Ctrl+S Save · Ctrl+Shift+S Save as · Ctrl+O Open · Ctrl+N New<br>Ctrl+B Bold · Ctrl+I Italic · Ctrl+F Find/replace · Ctrl+Shift+F Search notes<br>Drafts are saved automatically. Ctrl+S writes to your Markdown file.</div>`;
  if (tab === "Sync")
    body = `<span class="setting-label">Your notes, wherever you work.</span><p class="setting-help">Connect a cloud folder or sign in to GitHub. No API keys needed.</p><div class="provider-grid">${[
      ["onedrive", "OneDrive"],
      ["dropbox", "Dropbox"],
      ["google", "Google Drive"],
      ["github", "GitHub"],
    ]
      .map(
        ([id, label]) =>
          `<button class="provider ${s.syncProvider === id ? "selected" : ""}" data-provider="${id}">${icon(id === "github" ? "github" : "cloud")}<span>${label}</span></button>`,
      )
      .join(
        "",
      )}</div><div id="sync-details">${s.syncProvider === "github" ? githubForm() : s.syncProvider !== "none" ? `<div class="notice">Connected folder<br><strong>${esc(s.syncFolder)}</strong></div>` : '<div class="notice">OneDrive, Dropbox and Google Drive use their desktop sync folders. Select the same folder on each PC. GitHub uses browser sign-in and a repository you choose.</div>'}</div><div class="notice">Sync runs every 5 minutes and when you click Sync. Conflicting edits are kept as a separate note. Your notes are stored as readable text in the selected destination.</div><div class="modal-footer">${s.syncProvider !== "none" ? '<button class="secondary" id="disconnect-sync">Disconnect</button><button class="primary" id="sync-now">' + icon("sync") + " Sync now</button>" : ""}</div>`;
  if (tab === "Files")
    body =
      setting(
        "Markdown default app",
        "After installing Notes, choose it for .md in Windows Settings.",
        `<button class="secondary" id="default-apps">${icon("file")} Default apps</button>`,
      ) +
      `<div class="notice">The installer registers .md, .markdown and .mdown files. Windows asks you to choose your default app.<br><br>Open a file with Notes from File Explorer, drag it into this window, or press Ctrl+O. Open tabs and drafts are restored next time.</div><div class="setting-row"><div><span class="setting-label">Notes 1.0.0</span><p class="setting-help">Windows 10 / 11 · x64<br>A quiet place to write. An open format to keep.</p></div>${logo}</div>`;
  const el = modal("Settings", body, {
    nav: `<nav class="settings-nav">${["Appearance", "Editor", "Sync", "Files"].map((t) => `<button class="${t === tab ? "active" : ""}" data-settings-tab="${t}">${t}</button>`).join("")}</nav>`,
  });
  el.querySelectorAll("[data-settings-tab]").forEach(
    (b) => (b.onclick = () => showSettings(b.dataset.settingsTab)),
  );
  el.querySelectorAll("[data-theme-choice]").forEach(
    (b) =>
      (b.onclick = async () => {
        await setSettings({ theme: b.dataset.themeChoice });
        showSettings(tab);
      }),
  );
  el.querySelectorAll("[data-setting]").forEach((input) =>
    input.addEventListener("change", async () => {
      let value =
        input.type === "checkbox"
          ? input.checked
          : ["range", "number"].includes(input.type)
            ? Number(input.value)
            : input.value;
      if (input.type === "number")
        value = Math.max(10, Math.min(32, value || 13));
      if (input.nextElementSibling?.tagName === "OUTPUT")
        input.nextElementSibling.textContent = value + "%";
      await setSettings({ [input.dataset.setting]: value });
    }),
  );
  el.querySelectorAll("[data-provider]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          if (b.dataset.provider === "github") {
            await setSettings({ syncProvider: "github", lastSync: null });
            showSettings("Sync");
          } else {
            const result = await api.chooseSyncFolder(b.dataset.provider);
            if (result) {
              state.settings = result;
              showSettings("Sync");
              updateStatus();
            }
          }
        } catch (e) {
          error(e);
        }
      }),
  );
  $("#import-font")?.addEventListener("click", async () => {
    try {
      const font = await api.importFont();
      if (font) {
        state.customFonts.push(font);
        await loadFont(font);
        await setSettings({ editorFont: font.family });
        showSettings("Editor");
      }
    } catch (e) {
      error(e);
    }
  });
  $("#default-apps")?.addEventListener("click", () => api.defaultApps());
  $("#disconnect-sync")?.addEventListener("click", async () => {
    await setSettings({ syncProvider: "none", lastSync: null });
    showSettings("Sync");
  });
  $("#sync-now")?.addEventListener("click", () => runSync());
  bindGithub();
  if (!fonts.length && (tab === "Appearance" || tab === "Editor")) {
    fonts = await api.fonts();
    if ($(".settings-nav") && settingsTab === tab) showSettings(tab);
  }
}
function githubForm() {
  return `<div class="notice" id="github-status">Checking GitHub sign-in…</div><button class="secondary" id="github-login">${icon("github")} Sign in with browser</button><pre class="login-output" id="github-output"></pre><label class="form-label" for="github-repo">Sync repository</label><div style="display:flex;gap:8px"><input class="field full" id="github-repo" list="repo-options" placeholder="owner/repository" value="${esc(state.settings.githubRepo)}"><button class="primary" id="save-repo">Connect</button></div><datalist id="repo-options"></datalist><p class="setting-help">Choose a private repository for private notes. Notes uses .notes-sync/workspace.json in this repository.</p>`;
}
function bindGithub() {
  if (!$("#github-status")) return;
  api.githubStatus().then(async (result) => {
    if (!$("#github-status")) return;
    $("#github-status").textContent = result.connected
      ? "Signed in as " + result.user
      : "Sign in securely in your browser. A one-time code will appear here.";
    if (result.connected) {
      $("#github-login").textContent = "Signed in · switch account";
      try {
        const repos = await api.githubRepos();
        if ($("#repo-options"))
          $("#repo-options").innerHTML = repos
            .map(
              (r) =>
                `<option value="${esc(r.name)}">${r.private ? "Private" : "Public"}</option>`,
            )
            .join("");
      } catch (e) {
        error(e);
      }
    }
  });
  $("#github-login").onclick = async () => {
    try {
      $("#github-login").disabled = true;
      await api.githubLogin();
      showSettings("Sync");
    } catch (e) {
      error(e);
      if ($("#github-login")) $("#github-login").disabled = false;
    }
  };
  $("#save-repo").onclick = async () => {
    const repo = $("#github-repo")
      .value.trim()
      .replace(/^https:\/\/github.com\//, "")
      .replace(/\/$/, "");
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return toast("Use owner/repository.");
    await setSettings({
      githubRepo: repo,
      syncProvider: "github",
      lastSync: null,
    });
    toast("Repository connected. Click Sync now to begin.");
  };
}
async function runSync() {
  if (state.settings.syncProvider === "none") {
    showSettings("Sync");
    return;
  }
  if (syncBusy) return;
  syncBusy = true;
  updateStatus();
  try {
    await flush();
    const result = await api.sync();
    if (!result.busy)
      toast(
        result.conflicts
          ? `Synced. ${result.conflicts} conflict copies preserved.`
          : "Workspace synced successfully.",
      );
  } catch (e) {
    error(e);
  } finally {
    syncBusy = false;
    updateStatus();
  }
}
function wrapSelection(before, after = before, placeholder = "text") {
  const s = view.state.selection.main,
    text = view.state.sliceDoc(s.from, s.to) || placeholder;
  view.dispatch({
    changes: { from: s.from, to: s.to, insert: before + text + after },
    selection: {
      anchor: s.from + before.length,
      head: s.from + before.length + text.length,
    },
  });
  view.focus();
}
function prefixLines(prefix) {
  const s = view.state.selection.main,
    start = view.state.doc.lineAt(s.from).from,
    end = view.state.doc.lineAt(s.to).to,
    text = view.state.sliceDoc(start, end);
  view.dispatch({
    changes: {
      from: start,
      to: end,
      insert: text
        .split("\n")
        .map((l) => prefix + l)
        .join("\n"),
    },
  });
  view.focus();
}
function insert(text) {
  const s = view.state.selection.main;
  view.dispatch({
    changes: { from: s.from, to: s.to, insert: text },
    selection: { anchor: s.from + text.length },
  });
  view.focus();
}
function popover(anchor, items) {
  $(".popover")?.remove();
  const r = anchor.getBoundingClientRect(),
    el = document.createElement("div");
  el.className = "popover";
  el.style.top = r.bottom + 5 + "px";
  el.style.left = Math.min(r.left, innerWidth - 230) + "px";
  el.innerHTML = items
    .map(
      (i, n) =>
        `<button data-menu-index="${n}">${icon(i.icon || "file")}<span>${i.label}</span>${i.shortcut ? `<span class="shortcut">${i.shortcut}</span>` : ""}</button>`,
    )
    .join("");
  document.body.append(el);
  el.onclick = (e) => {
    const b = e.target.closest("[data-menu-index]");
    if (b) {
      el.remove();
      Promise.resolve(items[Number(b.dataset.menuIndex)].action()).catch(error);
    }
  };
}
function exportHTML() {
  const html = $("#preview").cloneNode(true);
  html.querySelectorAll("button").forEach((b) => b.remove());
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https: file:; font-src file: data:"><title>${esc(current().name)}</title><style>body{font:15px/1.6 "${esc(state.settings.previewFont)}","Segoe UI",sans-serif;color:#182135;max-width:850px;padding:40px;margin:auto}h1{font-size:32px}h2{margin-top:25px}pre{white-space:pre-wrap;background:#252b36;color:#e0e8f0;padding:22px;border-radius:7px;position:relative;page-break-inside:avoid}code{font-family:Consolas,monospace}table{border-collapse:collapse;width:100%}td,th{border:1px solid #dce2ec;padding:6px 10px;text-align:left}th{background:#edf1f6}blockquote{border-left:3px solid #347dff;background:#f0f3f8;padding:8px 16px;margin-left:0}img{max-width:100%}a{color:#165dff}.code-label{display:block;font:11px sans-serif;color:#aab5c4;margin-bottom:9px}.hljs-keyword{color:#e575de}.hljs-string{color:#efc76b}.hljs-comment{color:#94a3ad}.hljs-title{color:#ebc064}.hljs-params,.hljs-built_in{color:#77d4e3}input{accent-color:#176cff}@media print{body{padding:0}h1,h2,h3{break-after:avoid}thead{display:table-header-group}}</style></head><body>${html.innerHTML}</body></html>`;
}
async function exportFile(format) {
  await flush();
  const result = await api.export(current().id, format, exportHTML());
  if (result) toast("Exported to " + result);
}
async function save(as = false) {
  await flush();
  const doc = await api.save(current().id, as);
  if (doc) {
    Object.assign(current(), doc);
    drawTabs();
    drawSidebar();
    updateStatus();
    toast("Saved " + doc.name);
  }
}
function showSearch() {
  const el = modal(
    "Search notes",
    `<input class="field full" id="global-search" placeholder="Search titles, text, and tags…" aria-label="Search all notes"><div class="search-results" id="search-results"></div>`,
    { width: 620 },
  );
  const input = el.querySelector("input");
  input.value = searchQuery;
  input.oninput = () => {
    searchQuery = input.value;
    drawSearch();
  };
  drawSearch();
  input.focus();
}
function drawSearch() {
  const q = searchQuery.toLowerCase();
  const docs = state.docs.filter(
    (d) =>
      !d.trash &&
      (d.name + " " + d.content + " " + d.tags.join(" "))
        .toLowerCase()
        .includes(q),
  );
  $("#search-results").innerHTML =
    docs
      .map(
        (d) =>
          `<button class="search-result" data-search-doc="${d.id}"><strong>${icon("file")} ${esc(d.name)}</strong><p>${esc(d.content.replace(/[#*`]/g, "").slice(Math.max(0, d.content.toLowerCase().indexOf(q) - 30), 200))}</p></button>`,
      )
      .join("") || '<div class="empty">No matching notes.</div>';
  $$("[data-search-doc]").forEach(
    (b) =>
      (b.onclick = () => {
        activate(b.dataset.searchDoc);
        closeModal();
      }),
  );
}
function showLibrary(filter) {
  currentFilter = filter;
  drawSidebar();
  const docs = state.docs.filter((d) =>
    filter === "Trash"
      ? d.trash
      : filter === "Archive"
        ? d.archived && !d.trash
        : !d.trash &&
          !d.archived &&
          (filter === "All Notes" || filter.startsWith("tag:")
            ? filter === "All Notes" || d.tags.includes(filter.slice(4))
            : d.folders.includes(filter)),
  );
  modal(
    filter.startsWith("tag:") ? "# " + filter.slice(4) : filter,
    `<div class="search-results">${docs.map((d) => `<div class="library-row"><button class="search-result" data-library-doc="${d.id}"><strong>${icon("file")} ${esc(d.name)}</strong><p>${esc(d.content.replace(/[#*`]/g, "").slice(0, 100))}</p></button><button class="library-action" data-star="${d.id}" title="Toggle favorite">${icon("star")}</button><button class="library-action" data-organize="${d.id}" title="Organize note">${icon("more")}</button></div>`).join("") || '<div class="empty">No notes here yet.</div>'}</div><div class="modal-footer"><button class="primary" id="library-new">${icon("plus")} New note</button></div>`,
  );
  $$("[data-library-doc]").forEach(
    (b) =>
      (b.onclick = () => {
        activate(b.dataset.libraryDoc);
        closeModal();
      }),
  );
  $$("[data-star]").forEach(
    (b) =>
      (b.onclick = async () => {
        const d = state.docs.find((x) => x.id === b.dataset.star);
        d.favorite = !d.favorite;
        await api.update(d.id, { favorite: d.favorite });
        drawSidebar();
        toast(d.favorite ? "Added to Favorites" : "Removed from Favorites");
      }),
  );
  $$("[data-organize]").forEach(
    (b) => (b.onclick = () => organize(b.dataset.organize)),
  );
  $("#library-new").onclick = async () => {
    closeModal();
    await newNote();
  };
}
function organize(id = state.active) {
  const d = state.docs.find((x) => x.id === id);
  modal(
    "Organize note",
    `<label class="form-label">File name</label><input class="field full" id="note-name" value="${esc(d.name)}"><label class="form-label">Tags · separated by commas</label><input class="field full" id="note-tags" value="${esc(d.tags.join(", "))}"><label class="form-label">Collections</label><div style="display:flex;gap:20px;margin:14px 0">${["Personal", "Projects", "Learning"].map((f) => `<label><input type="checkbox" name="collection" value="${f}" ${d.folders.includes(f) ? "checked" : ""}> ${f}</label>`).join("")}</div><div style="display:flex;gap:20px"><label><input type="checkbox" id="note-favorite" ${d.favorite ? "checked" : ""}> Favorite</label><label><input type="checkbox" id="note-archive" ${d.archived ? "checked" : ""}> Archive</label></div><div class="modal-footer"><button class="secondary" id="note-trash">${icon(d.trash ? "undo" : "trash")} ${d.trash ? "Restore note" : "Move to Trash"}</button><button class="primary" id="note-done">Save changes</button></div>`,
    { width: 520 },
  );
  $("#note-done").onclick = async () => {
    let name = $("#note-name").value.trim() || "Untitled.md";
    if (!/\.md$/i.test(name)) name += ".md";
    const patch = {
      name,
      tags: [
        ...new Set(
          $("#note-tags")
            .value.split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        ),
      ],
      folders: $$("[name=collection]:checked").map((i) => i.value),
      favorite: $("#note-favorite").checked,
      archived: $("#note-archive").checked,
    };
    Object.assign(d, await api.update(id, patch));
    drawSidebar();
    drawTabs();
    closeModal();
  };
  $("#note-trash").onclick = async () => {
    Object.assign(d, await api.update(id, { trash: !d.trash }));
    drawSidebar();
    closeModal();
    toast(
      d.trash
        ? "Moved to Trash. You can restore it any time."
        : "Note restored.",
    );
  };
}
const actions = {
  new: newNote,
  open: async () => {
    await flush();
    for (const d of await api.open()) {
      if (!state.docs.some((x) => x.id === d.id)) state.docs.unshift(d);
      await activate(d.id);
    }
  },
  save: () => save(),
  undo: () => undo(view),
  redo: () => redo(view),
  bold: () => wrapSelection("**"),
  italic: () => wrapSelection("*"),
  list: () => prefixLines("- "),
  check: () => prefixLines("- [ ] "),
  quote: () => prefixLines("> "),
  code: () => wrapSelection("```javascript\n", "\n```", "// Your code here"),
  table: () =>
    insert(
      "\n| Feature | Description | Status |\n| --- | --- | --- |\n| Item | Description | Done |\n",
    ),
  heading: (el) =>
    popover(
      el,
      [1, 2, 3, 4].map((n) => ({
        icon: "heading",
        label: "Heading " + n,
        action: () => prefixLines("#".repeat(n) + " "),
      })),
    ),
  link: () => {
    modal(
      "Insert link",
      '<label class="form-label">Text</label><input class="field full" id="link-text" value="' +
        esc(
          view.state.sliceDoc(
            view.state.selection.main.from,
            view.state.selection.main.to,
          ),
        ) +
        '"><label class="form-label">URL</label><input class="field full" id="link-url" placeholder="https://"><div class="modal-footer"><button class="primary" id="link-insert">Insert link</button></div>',
      { width: 460 },
    );
    $("#link-insert").onclick = () => {
      const url = $("#link-url").value;
      if (!/^https?:\/\//i.test(url))
        return toast("Enter an http or https URL.");
      const text = $("#link-text").value || url;
      insert(
        "[" +
          text.replaceAll("]", "\\]") +
          "](" +
          url.replaceAll(")", "%29") +
          ")",
      );
      closeModal();
    };
  },
  image: async () => {
    const result = await api.chooseImage();
    if (result) insert("![" + result.name + "](" + result.url + ")");
  },
  split: () => {
    mode = mode === "split" ? "source" : "split";
    setMode();
  },
  preview: () => {
    mode = mode === "preview" ? "split" : "preview";
    setMode();
  },
  search: showSearch,
  export: (el) =>
    popover(
      el,
      ["pdf", "html", "md"].map((x) => ({
        icon: "export",
        label: "Export " + (x === "md" ? "Markdown" : x.toUpperCase()),
        action: () => exportFile(x),
      })),
    ),
  settings: () => showSettings(),
  theme: () => setSettings({ theme: isDark() ? "light" : "dark" }),
  sync: runSync,
  "add-tag": () => organize(),
  organize: () => organize(),
  "copy-link": () =>
    navigator.clipboard
      .writeText("# " + (headings[0]?.text || current().name))
      .then(() => toast("Note title copied")),
  "zoom-in": () =>
    setSettings({ zoom: Math.min(160, state.settings.zoom + 10) }),
  "zoom-out": () =>
    setSettings({ zoom: Math.max(70, state.settings.zoom - 10) }),
};
function setMode() {
  $(".panes").className = "panes " + mode;
  $("[data-action=split]").classList.toggle("active", mode === "split");
  $("[data-action=preview]").classList.toggle("active", mode === "preview");
  $("[data-action=split] .tool-label").textContent =
    mode === "source" ? "Source" : "Split View";
  view.requestMeasure();
}
function bindShell() {
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-action]");
    if (b) {
      Promise.resolve(actions[b.dataset.action]?.(b)).catch(error);
      return;
    }
    if (!e.target.closest(".popover")) $(".popover")?.remove();
    const w = e.target.closest("[data-window]");
    if (w) api.window(w.dataset.window);
    const tab = e.target.closest("[data-tab]"),
      close = e.target.closest("[data-close-tab]");
    if (close) {
      closeTab(close.dataset.closeTab).catch(error);
      return;
    }
    if (tab) activate(tab.dataset.tab).catch(error);
    const doc = e.target.closest("[data-doc]");
    if (doc) activate(doc.dataset.doc).catch(error);
    const filter = e.target.closest("[data-filter]");
    if (filter) showLibrary(filter.dataset.filter);
    const collapse = e.target.closest("[data-collapse]");
    if (collapse) {
      const t = collapse.dataset.collapse;
      collapsed.has(t) ? collapsed.delete(t) : collapsed.add(t);
      drawSidebar();
    }
    const it = e.target.closest("[data-inspector]");
    if (it) {
      inspector = it.dataset.inspector;
      drawInspector();
    }
    const h = e.target.closest("[data-heading]");
    if (h)
      $("#" + h.dataset.heading)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    const ex = e.target.closest("[data-export]");
    if (ex) exportFile(ex.dataset.export).catch(error);
  });
  document.addEventListener("contextmenu", (e) => {
    const el = e.target.closest("[data-tab],[data-doc]");
    if (el) {
      e.preventDefault();
      organize(el.dataset.tab || el.dataset.doc);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      $(".popover")?.remove();
      return;
    }
    if (e.key === "Tab" && $(".modal")) {
      const focusable = [
        ...$(".modal").querySelectorAll("button,input,select,a[href]"),
      ].filter((x) => !x.disabled);
      const first = focusable[0],
        last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    }
    if (!e.ctrlKey && !e.metaKey) return;
    const k = e.key.toLowerCase();
    if (k === "s") {
      e.preventDefault();
      save(e.shiftKey).catch(error);
    } else if (k === "n") {
      e.preventDefault();
      newNote().catch(error);
    } else if (k === "o") {
      e.preventDefault();
      actions.open().catch(error);
    } else if (k === "w" && !$(".modal")) {
      e.preventDefault();
      closeTab(state.active).catch(error);
    } else if (k === "f" && e.shiftKey) {
      e.preventDefault();
      showSearch();
    } else if (!$(".modal") && ["b", "i"].includes(k)) {
      e.preventDefault();
      actions[k === "b" ? "bold" : "italic"]();
    } else if (k === ",") {
      e.preventDefault();
      showSettings();
    } else if (e.shiftKey && k === "p") {
      e.preventDefault();
      actions.preview();
    }
  });
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", async (e) => {
    e.preventDefault();
    try {
      for (const d of await api.openDropped([...e.dataTransfer.files])) {
        if (!state.docs.some((x) => x.id === d.id)) state.docs.unshift(d);
        await activate(d.id);
      }
    } catch (err) {
      error(err);
    }
  });
  $(".preview-pane").addEventListener("scroll", () => {
    if (!state.settings.syncScroll || scrollLock || mode !== "split") return;
    scrollLock = true;
    const p = $(".preview-pane");
    view.scrollDOM.scrollTop =
      (p.scrollTop / Math.max(1, p.scrollHeight - p.clientHeight)) *
      (view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight);
    requestAnimationFrame(() => (scrollLock = false));
  });
  const divider = $(".divider");
  divider.addEventListener("pointerdown", (e) => {
    divider.setPointerCapture(e.pointerId);
    divider.onpointermove = (ev) => {
      const r = $(".panes").getBoundingClientRect();
      $(".editor-pane").style.width =
        Math.min(75, Math.max(25, ((ev.clientX - r.left) / r.width) * 100)) +
        "%";
      view.requestMeasure();
    };
    divider.onpointerup = () => (divider.onpointermove = null);
  });
  divider.addEventListener("keydown", (e) => {
    if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
      const r = $(".panes").getBoundingClientRect(),
        width =
          ($(".editor-pane").getBoundingClientRect().width / r.width) * 100;
      $(".editor-pane").style.width =
        Math.min(75, Math.max(25, width + (e.key === "ArrowRight" ? 2 : -2))) +
        "%";
    }
  });
  $(".titlebar").addEventListener("dblclick", (e) => {
    if (!e.target.closest("button")) api.window("maximize");
  });
}
async function boot() {
  state = await api.load();
  if (!state.docs.length) {
    const d = await api.create("Untitled.md", "");
    state.docs.push(d);
    state.active = d.id;
    state.tabs = [d.id];
  }
  if (!state.docs.some((d) => d.id === state.active))
    state.active = state.docs[0].id;
  if (!state.tabs.includes(state.active)) state.tabs.push(state.active);
  for (const font of state.customFonts) await loadFont(font);
  drawShell();
  api.on("opened", async (doc) => {
    await flush();
    if (!state.docs.some((d) => d.id === doc.id)) state.docs.unshift(doc);
    await activate(doc.id);
  });
  api.on("sync-result", async (result) => {
    if (result.error) {
      $("#sync-text").textContent = "Sync needs attention";
      toast(result.error);
      return;
    }
    try {
      await flush();
      const fresh = await api.load();
      const previousContent = current().content;
      state.docs = fresh.docs;
      state.settings = fresh.settings;
      if (current().content !== previousContent) {
        cachedStates.delete(state.active);
        view.setState(
          EditorState.create({
            doc: current().content,
            extensions: editorExtensions(),
          }),
        );
      }
      drawSidebar();
      drawTabs();
      renderPreview();
      updateStatus();
      if (result.conflicts)
        toast(`${result.conflicts} sync conflict copies preserved.`);
    } catch (e) {
      error(e);
    }
  });
  api.on("github-login-output", (text) => {
    if ($("#github-output")) $("#github-output").textContent += text;
  });
  api.on("close-request", async () => {
    try {
      await flush();
      await api.session(state.tabs, state.active);
      await api.window("close-ready");
    } catch (e) {
      error(e);
    }
  });
  matchMedia("(prefers-color-scheme:dark)").addEventListener("change", () =>
    applySettings(),
  );
  setInterval(updateStatus, 60000);
  await api.ready();
}
boot().catch((e) => {
  document.body.textContent = "Notes could not start: " + e.message;
  console.error(e);
});
