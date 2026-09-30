// Caption history, persisted in this browser's localStorage (last 30 results).

import { $, downloadBlob, escapeHtml, icon, pct, storage, toast } from "./ui.js";

const KEY = "pixelprose.history";
const LIMIT = 30;
let entries = storage.get(KEY, []);
let onRestore = () => {};

export function initHistory(restoreFn) {
  onRestore = restoreFn;
  $("#historyBtn").addEventListener("click", toggleDrawer);
  $("#drawerClose").addEventListener("click", () => toggleDrawer(false));
  $("#scrim").addEventListener("click", () => toggleDrawer(false));
  $("#historyClear").addEventListener("click", () => {
    if (!entries.length) return;
    entries = [];
    persist();
    render();
    toast("History cleared", "success");
  });
  $("#historyExport").addEventListener("click", () => {
    if (!entries.length) return toast("Nothing to export yet.", "info");
    const rows = entries.map((e) => ({
      time: new Date(e.ts).toISOString(), caption: e.result.caption, confidence: e.result.confidence,
      match: e.result.match, model: e.result.model, hashtags: e.result.hashtags.join(" "),
    }));
    downloadBlob(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }), "pixelprose-history.json");
  });
  $("#historyList").addEventListener("click", (e) => {
    const item = e.target.closest(".history-item");
    if (!item) return;
    const entry = entries.find((x) => x.id === item.dataset.id);
    if (e.target.closest("[data-remove]")) {
      entries = entries.filter((x) => x !== entry);
      persist();
      render();
      return;
    }
    toggleDrawer(false);
    onRestore(entry);
  });
  render();
}

export function toggleDrawer(force) {
  const drawer = $("#drawer");
  const open = typeof force === "boolean" ? force : !drawer.classList.contains("open");
  drawer.classList.toggle("open", open);
  drawer.setAttribute("aria-hidden", !open);
  $("#scrim").classList.toggle("show", open);
}

export function addHistory({ thumb, result, imageId }) {
  const { palette, ...slim } = result; // keep storage small
  entries.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now(), thumb, imageId, result: { ...slim, palette: palette.slice(0, 6) } });
  entries = entries.slice(0, LIMIT);
  while (!persist() && entries.length > 1) entries.pop(); // localStorage full: drop the oldest
  render();
}

function persist() {
  return storage.set(KEY, entries);
}

function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
}

function render() {
  const list = $("#historyList");
  const count = $("#historyCount");
  count.hidden = !entries.length;
  count.textContent = entries.length;
  $("#historyEmpty").hidden = entries.length > 0;
  list.innerHTML = entries
    .map((e, i) => `
      <li class="history-item" data-id="${e.id}" style="animation-delay:${Math.min(i, 10) * 40}ms">
        ${e.thumb ? `<img src="${escapeHtml(e.thumb)}" alt="" loading="lazy" />` : `<div></div>`}
        <div><p>${escapeHtml(e.result.sentence)}</p><small>${timeAgo(e.ts)} · ${e.result.model} · ${pct(e.result.match ?? e.result.confidence)}</small></div>
        <button class="icon-btn" data-remove aria-label="Remove from history">${icon("x")}</button>
      </li>`)
    .join("");
}
