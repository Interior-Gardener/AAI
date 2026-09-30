// Batch mode: caption many images one after another and export the results.

import { api } from "./api.js";
import { $, downloadBlob, escapeHtml, pct, toast } from "./ui.js";

const MAX_FILES = 12;
let items = [];
let running = false;

export function initBatch(getSettings) {
  const drop = $("#batchDrop");
  const input = $("#batchInput");

  input.addEventListener("change", () => {
    enqueue([...input.files], getSettings);
    input.value = "";
  });
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => {
    e.preventDefault();
    drop.classList.add("drag");
  }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
  }));
  drop.addEventListener("drop", (e) => enqueue([...e.dataTransfer.files], getSettings));

  $("#batchCsv").addEventListener("click", exportCsv);
  $("#batchJson").addEventListener("click", exportJson);
  $("#batchClear").addEventListener("click", () => {
    if (running) return toast("Wait for the current batch to finish.", "info");
    items.forEach((i) => URL.revokeObjectURL(i.url));
    items = [];
    $("#batchGrid").innerHTML = "";
    $("#batchToolbar").hidden = true;
  });
}

async function enqueue(files, getSettings) {
  files = files.filter((f) => f.type.startsWith("image/"));
  if (!files.length) return toast("No images found in that selection.", "error");
  if (running) return toast("A batch is already running.", "info");
  if (files.length > MAX_FILES) {
    toast(`Only the first ${MAX_FILES} images will be captioned.`, "info");
    files = files.slice(0, MAX_FILES);
  }
  const grid = $("#batchGrid");
  const fresh = files.map((file, i) => {
    const item = { file, url: URL.createObjectURL(file), status: "queued", result: null };
    const card = document.createElement("article");
    card.className = "batch-item";
    card.style.animationDelay = `${i * 50}ms`;
    card.innerHTML = `<div class="thumb"><img src="${item.url}" alt="" /><div class="scanner" hidden><div class="scan-beam"></div></div></div>
      <div class="body"><p class="muted">Waiting…</p><small><span>${escapeHtml(file.name)}</span><span></span></small></div>`;
    grid.append(card);
    item.card = card;
    return item;
  });
  items.push(...fresh);
  $("#batchToolbar").hidden = false;
  running = true;

  const settings = getSettings();
  const fields = { model: settings.model, strategy: "beam", num_candidates: 3, rerank: settings.rerank, max_new_tokens: settings.max_new_tokens };
  for (const item of fresh) {
    const scanner = item.card.querySelector(".scanner");
    const text = item.card.querySelector("p");
    const meta = item.card.querySelector("small span:last-child");
    scanner.hidden = false;
    text.textContent = "Captioning…";
    try {
      item.result = await api.caption(item.file, fields);
      item.status = "done";
      text.classList.remove("muted");
      text.textContent = item.result.sentence;
      meta.textContent = `${pct(item.result.match ?? item.result.confidence)} · ${(item.result.timings.total_ms / 1000).toFixed(1)}s`;
    } catch (err) {
      item.status = "error";
      item.card.classList.add("error");
      text.textContent = err.message;
    }
    scanner.hidden = true;
    updateProgress();
  }
  running = false;
  toast(`Batch finished: ${fresh.filter((i) => i.status === "done").length}/${fresh.length} captioned`, "success");
}

function updateProgress() {
  const done = items.filter((i) => i.status !== "queued").length;
  $("#batchStatus").textContent = `${done} / ${items.length}`;
  $("#batchProgressBar").style.width = `${(done / items.length) * 100}%`;
}

function rows() {
  return items.filter((i) => i.result).map((i) => ({
    filename: i.file.name, caption: i.result.caption, confidence: i.result.confidence,
    match: i.result.match, keywords: i.result.keywords.join(" "), hashtags: i.result.hashtags.join(" "),
  }));
}

function exportCsv() {
  const data = rows();
  if (!data.length) return toast("Nothing to export yet.", "info");
  const cols = Object.keys(data[0]);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(","), ...data.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv" }), "pixelprose-captions.csv");
}

function exportJson() {
  const data = rows();
  if (!data.length) return toast("Nothing to export yet.", "info");
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "pixelprose-captions.json");
}
