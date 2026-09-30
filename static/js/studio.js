// Caption Studio: image input (upload / paste / URL / camera / samples), generation, result rendering.

import { api } from "./api.js";
import { startCamera, stopCamera, capturePhoto, flipCamera } from "./camera.js";
import { renderShareCard } from "./card.js";
import { initChat, resetChat } from "./chat.js";
import { Explainer } from "./explain.js";
import { addHistory } from "./history.js";
import { getDevice } from "./status.js";
import {
  $, $$, copyText, countUp, dataUrlToBlob, downloadBlob, escapeHtml, icon, initRange, initSegmented, initTabs,
  pct, revealWords, seconds, sleep, sparkleBurst, storage, thumbnail, toast,
} from "./ui.js";

const SETTINGS_KEY = "pixelprose.settings";

const state = {
  file: null, // Blob of the current image (null for URL images)
  url: null, // remote URL when the image came from the URL tab
  imageId: null, // server-side id once the image has been uploaded
  result: null,
  caption: "", // the caption currently shown (may be a promoted candidate)
  busy: false,
  objectUrl: null,
};

const el = {};
let explainer;
let sourceTabs;
let resultTabs;
let controls;

export const studio = {
  get imageId() { return state.imageId; },
  get caption() { return state.caption; },
  get hasResult() { return !!state.result; },
  generate: () => generate(),
  copy: () => copyCaption(),
  speak: () => speak(),
  clear: () => clearImage(),
  restore: (entry) => restore(entry),
  settings: () => readSettings(),
};

export function initStudio() {
  Object.assign(el, {
    stage: $("#stage"), dropzone: $("#dropzone"), fileInput: $("#fileInput"), preview: $("#preview"),
    previewImg: $("#previewImg"), previewMeta: $("#previewMeta"), scanner: $("#scanner"),
    urlPane: $("#urlPane"), cameraPane: $("#cameraPane"), samplesPane: $("#samplesPane"),
    generateBtn: $("#generateBtn"), resultEmpty: $("#resultEmpty"), resultLoading: $("#resultLoading"), result: $("#result"),
    captionText: $("#captionText"), candidates: $("#candidates"),
  });

  explainer = new Explainer({
    img: el.previewImg, canvas: $("#heatCanvas"), words: $("#explainWords"),
    play: $("#explainPlay"), overall: $("#explainOverall"), hide: $("#explainHide"), opacity: $("#heatOpacity"),
  });

  initSources();
  initSettings();
  initResultActions();
  initChat(() => state.imageId, () => state.caption);
  buildNeuralNet();

  el.generateBtn.addEventListener("click", generate);
  resultTabs = initTabs($("#resultTabs"), "tab", (tab) => {
    $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === tab));
    if (tab === "explain") explainer.ensureVisible();
    else explainer.hideOverlay();
  });
}

/* =========================================================== input */

function initSources() {
  sourceTabs = initTabs($("#sourceTabs"), "source", showSource);

  el.fileInput.addEventListener("change", () => {
    const f = el.fileInput.files[0];
    if (f) setImage(f, f.name);
    el.fileInput.value = "";
  });

  // Drag & drop anywhere on the input panel
  const panel = $(".input-panel");
  ["dragenter", "dragover"].forEach((type) =>
    panel.addEventListener(type, (e) => {
      e.preventDefault();
      el.dropzone.classList.add("drag");
    }),
  );
  ["dragleave", "drop"].forEach((type) =>
    panel.addEventListener(type, (e) => {
      e.preventDefault();
      if (type === "dragleave" && panel.contains(e.relatedTarget)) return;
      el.dropzone.classList.remove("drag");
    }),
  );
  panel.addEventListener("drop", (e) => {
    const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith("image/"));
    if (f) setImage(f, f.name);
    else toast("Please drop an image file.", "error");
  });

  // Paste from clipboard
  document.addEventListener("paste", (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (!item) return;
    const blob = item.getAsFile();
    setImage(blob, "pasted image");
    toast("Image pasted from clipboard", "success");
    $("#studio").scrollIntoView({ behavior: "smooth" });
  });

  // URL
  el.urlPane.addEventListener("submit", (e) => {
    e.preventDefault();
    const url = $("#urlInput").value.trim();
    if (!url) return;
    setRemoteImage(url);
  });

  // Camera
  $("#cameraShot").addEventListener("click", async () => {
    const blob = await capturePhoto($("#cameraVideo"));
    if (!blob) return;
    const flash = document.createElement("div");
    flash.className = "flash";
    document.body.append(flash);
    flash.addEventListener("animationend", () => flash.remove());
    setImage(blob, "camera photo");
  });
  $("#cameraFlip").addEventListener("click", () => flipCamera($("#cameraVideo")));

  $("#clearBtn").addEventListener("click", clearImage);
  loadSamples();
}

function showSource(source) {
  if (source !== "camera") stopCamera();
  const hasImage = !!(state.file || state.url);
  el.dropzone.hidden = !(source === "upload" && !hasImage);
  el.preview.hidden = !(source === "upload" && hasImage);
  el.urlPane.hidden = source !== "url";
  el.cameraPane.hidden = source !== "camera";
  el.samplesPane.hidden = source !== "samples";
  if (source === "camera") {
    startCamera($("#cameraVideo")).catch((err) => {
      toast(err.message, "error");
      sourceTabs.select("upload");
    });
  }
  if (source === "url") setTimeout(() => $("#urlInput").focus(), 50);
}

async function loadSamples() {
  const grid = $("#sampleGrid");
  const filters = $("#sampleFilters");
  let samples = [];
  try {
    samples = (await api.samples()).samples;
  } catch {
    grid.innerHTML = `<p class="muted">Samples unavailable.</p>`;
    return;
  }
  const categories = ["all", ...new Set(samples.map((s) => s.category))];
  filters.innerHTML = categories.map((c, i) => `<button type="button" class="${i ? "" : "active"}" data-cat="${c}">${c}</button>`).join("");
  const render = (cat) => {
    grid.innerHTML = samples
      .filter((s) => cat === "all" || s.category === cat)
      .map((s, i) => `<button type="button" class="sample" data-url="${s.url}" data-name="${escapeHtml(s.name)}" style="animation-delay:${i * 25}ms">
          <img src="${s.url}" alt="${escapeHtml(s.name)}" loading="lazy" /><span>${escapeHtml(s.name)}</span></button>`)
      .join("");
  };
  render("all");
  filters.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    $$("button", filters).forEach((x) => x.classList.toggle("active", x === b));
    render(b.dataset.cat);
  });
  grid.addEventListener("click", async (e) => {
    const b = e.target.closest(".sample");
    if (!b) return;
    const blob = await (await fetch(b.dataset.url)).blob();
    setImage(blob, `${b.dataset.name}.jpg`);
  });
}

function setImage(blob, name = "image") {
  if (!blob.type.startsWith("image/")) {
    toast("That file is not an image.", "error");
    return;
  }
  if (blob.size > 15 * 1024 * 1024) {
    toast("Image is larger than 15 MB.", "error");
    return;
  }
  resetForNewImage();
  state.file = blob;
  state.file.name ??= name;
  state.objectUrl = URL.createObjectURL(blob);
  showPreview(state.objectUrl, `${name} · ${(blob.size / 1024).toFixed(0)} KB`);
}

function setRemoteImage(url) {
  resetForNewImage();
  state.url = url;
  showPreview(url, new URL(url).hostname);
}

function showPreview(src, meta) {
  el.previewImg.onload = () => {
    el.previewMeta.textContent = `${meta} · ${el.previewImg.naturalWidth}×${el.previewImg.naturalHeight}`;
  };
  el.previewImg.onerror = () => {
    if (state.url) el.previewMeta.textContent = `${meta} · preview blocked, the server will fetch it`;
  };
  el.previewImg.src = src;
  sourceTabs.select("upload", true);
  showSource("upload");
  el.generateBtn.disabled = false;
  if (window.innerWidth < 1080) el.generateBtn.scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetForNewImage() {
  stopCamera();
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  Object.assign(state, { file: null, url: null, imageId: null, result: null, caption: "", objectUrl: null });
  explainer.reset();
  resetChat();
  showPanel("empty");
}

function clearImage() {
  resetForNewImage();
  el.previewImg.removeAttribute("src");
  el.previewMeta.textContent = "";
  el.generateBtn.disabled = true;
  showSource($("#sourceTabs .tab.active")?.dataset.source || "upload");
}

/* =========================================================== settings */

function initSettings() {
  const saved = storage.get(SETTINGS_KEY, {});
  controls = {
    model: initSegmented($('.segmented[data-name="model"]'), save),
    strategy: initSegmented($('.segmented[data-name="strategy"]'), save),
    numCandidates: $("#numCandidates"), maxTokens: $("#maxTokens"), temperature: $("#temperature"), numBeams: $("#numBeams"),
    prompt: $("#promptInput"), rerank: $("#rerankToggle"), explain: $("#explainToggle"), speak: $("#speakToggle"),
  };
  if (saved.model) controls.model.value = saved.model;
  if (saved.strategy) controls.strategy.value = saved.strategy;
  for (const k of ["numCandidates", "maxTokens", "temperature", "numBeams"]) if (saved[k]) controls[k].value = saved[k];
  for (const k of ["rerank", "explain", "speak"]) if (typeof saved[k] === "boolean") controls[k].checked = saved[k];

  for (const k of ["numCandidates", "maxTokens", "temperature", "numBeams"]) {
    initRange(controls[k], k === "temperature" ? (v) => Number(v).toFixed(1) : undefined);
    controls[k].addEventListener("change", save);
  }
  for (const k of ["rerank", "explain", "speak"]) controls[k].addEventListener("change", save);
  $("#promptChips").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    controls.prompt.value = controls.prompt.value === b.textContent ? "" : b.textContent;
    controls.prompt.focus();
  });

  function save() {
    storage.set(SETTINGS_KEY, {
      model: controls.model.value, strategy: controls.strategy.value,
      numCandidates: controls.numCandidates.value, maxTokens: controls.maxTokens.value,
      temperature: controls.temperature.value, numBeams: controls.numBeams.value,
      rerank: controls.rerank.checked, explain: controls.explain.checked, speak: controls.speak.checked,
    });
  }
}

function readSettings() {
  return {
    model: controls.model.value,
    strategy: controls.strategy.value,
    num_candidates: controls.numCandidates.value,
    max_new_tokens: controls.maxTokens.value,
    temperature: controls.temperature.value,
    num_beams: Math.max(Number(controls.numBeams.value), Number(controls.numCandidates.value)),
    prompt: controls.prompt.value.trim(),
    rerank: controls.rerank.checked,
  };
}

/* =========================================================== generation */

function showPanel(which) {
  el.resultEmpty.hidden = which !== "empty";
  el.resultLoading.hidden = which !== "loading";
  el.result.hidden = which !== "result";
}

async function generate() {
  if (state.busy) return;
  if (!state.file && !state.url && !state.imageId) {
    toast("Choose an image first.", "info");
    return;
  }
  state.busy = true;
  document.body.classList.add("busy");
  const settings = readSettings();
  el.generateBtn.disabled = true;
  el.generateBtn.classList.add("loading");
  $(".label", el.generateBtn).textContent = "Generating";
  el.scanner.hidden = false;
  fitToImage(el.scanner);
  explainer.hideOverlay();
  showPanel("loading");
  const stopAnim = animatePipeline(settings.model);

  try {
    let res;
    try {
      res = await api.caption(state.imageId ? null : state.file, {
        ...settings, image_id: state.imageId, url: state.imageId || state.file ? undefined : state.url,
      });
    } catch (err) {
      if (err.status === 404 && (state.file || state.url)) {
        state.imageId = null; // server cache expired: upload the image again
        res = await api.caption(state.file, { ...settings, url: state.file ? undefined : state.url });
      } else throw err;
    }
    await stopAnim(true);
    state.imageId = res.image_id;
    renderResult(res);
    saveToHistory(res);
    if (controls.explain.checked) explainer.load(state.imageId, res.caption);
    if (controls.speak.checked) speak();
  } catch (err) {
    await stopAnim(false);
    showPanel(state.result ? "result" : "empty");
    toast(err.message, "error", 5000);
  } finally {
    state.busy = false;
    document.body.classList.remove("busy");
    el.scanner.hidden = true;
    el.generateBtn.disabled = false;
    el.generateBtn.classList.remove("loading");
    $(".label", el.generateBtn).textContent = "Generate caption";
  }
}

function fitToImage(overlay) {
  const img = el.previewImg;
  Object.assign(overlay.style, {
    left: `${img.offsetLeft}px`, top: `${img.offsetTop}px`, width: `${img.offsetWidth}px`, height: `${img.offsetHeight}px`, inset: "auto",
  });
}

/* Loading animation: neural net + staged pipeline checklist */
function buildNeuralNet() {
  const svg = $(".neural svg");
  const layers = [3, 5, 5, 3];
  const nodes = layers.map((n, li) =>
    Array.from({ length: n }, (_, i) => ({ x: 20 + li * 60, y: 60 + (i - (n - 1) / 2) * 24 })),
  );
  let edges = "";
  for (let l = 0; l < nodes.length - 1; l++)
    for (const a of nodes[l]) for (const b of nodes[l + 1]) edges += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
  $(".edges", svg).innerHTML = edges;
  $(".nodes", svg).innerHTML = nodes.flat().map((p) => `<circle cx="${p.x}" cy="${p.y}" r="5"/>`).join("");
}

function animatePipeline(model) {
  const steps = $$("#pipelineSteps li");
  const lines = $$(".neural line");
  const circles = $$(".neural circle");
  steps.forEach((s) => s.classList.remove("active", "done"));
  const set = (i) => steps.forEach((s, j) => {
    s.classList.toggle("done", j < i);
    s.classList.toggle("active", j === i);
  });
  set(0);
  const times = model === "base" ? [450, 1600] : [1300, 3800];
  const timers = times.map((t, i) => setTimeout(() => set(i + 1), t));
  const fire = setInterval(() => {
    lines.forEach((l) => l.classList.toggle("fire", Math.random() < 0.18));
    circles.forEach((c) => c.classList.toggle("on", Math.random() < 0.3));
  }, 220);
  return async (ok) => {
    timers.forEach(clearTimeout);
    clearInterval(fire);
    if (ok) {
      set(3);
      await sleep(260);
      set(4);
      await sleep(200);
    }
  };
}

/* =========================================================== rendering */

function renderResult(res) {
  state.result = res;
  state.caption = res.caption;
  showPanel("result");
  $("#cachedTag").hidden = !res.cached;
  revealWords(el.captionText, res.sentence);
  setRing($("#ringConfidence"), res.confidence);
  setRing($("#ringMatch"), res.match);
  const timeEl = $("#timeValue");
  countUp(timeEl, res.timings.total_ms / 1000, 900, 1);
  $("#timeDetail").textContent = `${res.model} model · ${getDevice().toUpperCase()}`;
  renderCandidates(res);
  renderWordBars(res.word_confidence);
  renderInsights(res);
  sparkleBurst($(".caption-card"));
}

function setRing(ring, value) {
  const label = $("span", ring);
  if (value === null || value === undefined) {
    ring.style.setProperty("--p", 0);
    label.textContent = "–";
    return;
  }
  ring.style.setProperty("--p", 0);
  requestAnimationFrame(() => ring.style.setProperty("--p", Math.floor(value * 100)));
  let current = 0;
  const target = Math.floor(value * 100); // never round 99.7% up to a "perfect" 100%
  const step = () => {
    current = Math.min(target, current + Math.max(1, Math.round(target / 30)));
    label.textContent = `${current}%`;
    if (current < target) requestAnimationFrame(step);
  };
  step();
}

function renderCandidates(res) {
  el.candidates.innerHTML = res.candidates
    .map((c, i) => `
      <li class="candidate ${c.text === state.caption ? "best" : ""}" data-text="${escapeHtml(c.text)}" style="animation-delay:${i * 70}ms" title="Click to use this caption">
        <span class="rank">${i + 1}</span>
        <div>
          <div class="text">${escapeHtml(c.text)}</div>
          <div class="meta">
            <span class="src">${c.source}</span>
            <span>confidence ${pct(c.confidence)}</span>
            ${c.match !== undefined ? `<span>match ${pct(c.match, 1)}</span>` : ""}
          </div>
          <div class="bar-track"><span data-w="${Math.round(c.score * 100)}"></span></div>
        </div>
        <span class="score">${(c.score * 100).toFixed(1)}</span>
      </li>`)
    .join("");
  requestAnimationFrame(() => $$(".bar-track span", el.candidates).forEach((b) => (b.style.width = `${b.dataset.w}%`)));
}

function renderWordBars(words = []) {
  const box = $("#wordBars");
  box.innerHTML = words
    .map((w) => `<div class="word-bar ${w.p < 0.25 ? "low" : ""}" data-tip="${escapeHtml(w.word)}: ${(w.p * 100).toFixed(1)}% probability">
        <b>${Math.round(w.p * 100)}</b><i data-h="${Math.max(4, w.p * 100)}"></i><small>${escapeHtml(w.word)}</small></div>`)
    .join("");
  requestAnimationFrame(() => $$(".word-bar i", box).forEach((b, i) => setTimeout(() => (b.style.height = `${b.dataset.h * 0.8}px`), i * 50)));
}

function renderInsights(res) {
  $("#keywordTags").innerHTML = res.keywords.map((k, i) => `<span style="animation-delay:${i * 40}ms">${escapeHtml(k)}</span>`).join("") || `<span class="muted">none</span>`;
  $("#hashtagTags").innerHTML = res.hashtags.map((h, i) => `<span data-tip="Click to copy all hashtags" style="animation-delay:${i * 40}ms">${escapeHtml(h)}</span>`).join("");
  $("#palette").innerHTML = res.palette
    .map((c) => `<button type="button" style="background:${c.hex};--share:${Math.max(c.share * 10, 0.4)}" data-hex="${c.hex}" data-tip="${c.hex} · ${pct(c.share)} — click to copy"><span>${c.hex}</span></button>`)
    .join("");
  const m = res.metadata;
  $("#imageMeta").innerHTML = [
    ["Resolution", `${m.width} × ${m.height}`], ["Megapixels", m.megapixels], ["Aspect", m.aspect_ratio],
    ["Format", m.format], ["File size", `${m.file_size_kb} KB`], ["Tone", `${m.tone} (${pct(m.brightness)})`],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(String(v))}</dd>`).join("");
  const t = res.timings;
  const parts = [["Vision", t.vision_ms], ["Decode", t.decode_ms], ["Scoring", t.scoring_ms], ["Re-rank", t.rerank_ms]].filter(([, v]) => v);
  const max = Math.max(...parts.map(([, v]) => v));
  $("#timing").innerHTML = parts
    .map(([k, v]) => `<div class="t"><span>${k}</span><div class="bar-track"><span style="width:${(v / max) * 100}%"></span></div><b>${seconds(v)} s</b></div>`)
    .join("") + (res.cached ? `<p class="muted">Served instantly from cache.</p>` : "");
  $("#altText").textContent = res.alt_text;
}

/* =========================================================== actions */

function initResultActions() {
  $("#copyBtn").addEventListener("click", copyCaption);
  $("#speakBtn").addEventListener("click", speak);
  $("#regenBtn").addEventListener("click", generate);
  $("#cardBtn").addEventListener("click", async () => {
    if (!state.result) return;
    try {
      const blob = await renderShareCard(el.previewImg, { ...state.result, sentence: sentenceOf(state.caption) });
      downloadBlob(blob, "pixelprose-caption.png");
      toast("Caption card downloaded", "success");
    } catch {
      toast("Could not create the card for this image.", "error");
    }
  });
  $("#copyAltBtn").addEventListener("click", async () => {
    await copyText($("#altText").textContent);
    toast("Alt-text HTML copied", "success");
  });
  $("#hashtagTags").addEventListener("click", async () => {
    await copyText(state.result.hashtags.join(" "));
    toast("Hashtags copied", "success");
  });
  $("#palette").addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    await copyText(b.dataset.hex);
    toast(`Copied ${b.dataset.hex}`, "success");
  });
  el.candidates.addEventListener("click", (e) => {
    const li = e.target.closest(".candidate");
    if (!li || li.dataset.text === state.caption) return;
    promote(li.dataset.text);
  });
  window.addEventListener("resize", () => {
    if (!el.scanner.hidden) fitToImage(el.scanner);
  });
}

function sentenceOf(text) {
  const t = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function promote(text) {
  state.caption = text;
  revealWords(el.captionText, sentenceOf(text));
  $$(".candidate", el.candidates).forEach((c) => c.classList.toggle("best", c.dataset.text === text));
  const cand = state.result.candidates.find((c) => c.text === text);
  if (cand) {
    setRing($("#ringConfidence"), cand.confidence);
    setRing($("#ringMatch"), cand.match);
  }
  explainer.load(state.imageId, text);
  toast("Caption swapped — heatmaps updated", "info");
}

async function copyCaption() {
  if (!state.caption) return;
  await copyText(sentenceOf(state.caption));
  const b = $("#copyBtn");
  b.classList.add("done");
  b.innerHTML = `${icon("check")}Copied`;
  setTimeout(() => {
    b.classList.remove("done");
    b.innerHTML = `${icon("copy")}Copy`;
  }, 1600);
}

function speak() {
  if (!state.caption) return;
  if (!("speechSynthesis" in window)) {
    toast("Speech is not supported in this browser.", "error");
    return;
  }
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
    return;
  }
  const u = new SpeechSynthesisUtterance(sentenceOf(state.caption));
  u.rate = 0.95;
  const voice = speechSynthesis.getVoices().find((v) => /en[-_](US|GB|IN)/i.test(v.lang) && /natural|google|samantha|daniel/i.test(v.name));
  if (voice) u.voice = voice;
  const b = $("#speakBtn");
  b.classList.add("active");
  u.onend = u.onerror = () => b.classList.remove("active");
  speechSynthesis.speak(u);
}

/* =========================================================== history */

async function saveToHistory(res) {
  let thumb = null;
  try {
    await el.previewImg.decode();
    thumb = thumbnail(el.previewImg);
  } catch {
    thumb = state.url; // cross-origin images cannot be drawn to a canvas
  }
  addHistory({ thumb, result: res, imageId: res.image_id });
}

async function restore(entry) {
  resetForNewImage();
  if (entry.thumb?.startsWith("data:")) {
    const blob = await dataUrlToBlob(entry.thumb);
    state.file = blob;
    state.file.name ??= "history.jpg";
    state.objectUrl = URL.createObjectURL(blob);
    showPreview(state.objectUrl, "from history");
  } else if (entry.thumb) {
    state.url = entry.thumb;
    showPreview(entry.thumb, "from history");
  }
  renderResult({ ...entry.result, cached: true });
  $("#studio").scrollIntoView({ behavior: "smooth" });
  // Re-register the image with the server so Explain / Ask / Match keep working after a restart.
  try {
    state.imageId = state.file ? (await api.upload(state.file)).image_id : entry.imageId;
  } catch {
    state.imageId = entry.imageId;
  }
  if (controls.explain.checked && state.imageId) explainer.load(state.imageId, state.caption);
}
