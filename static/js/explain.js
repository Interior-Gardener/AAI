// Attention explorer: draws per-word Grad-CAM heatmaps over the preview image.

import { api } from "./api.js";
import { $, $$, escapeHtml, icon, reducedMotion } from "./ui.js";

// "Turbo"-like colour ramp: blue → cyan → green → yellow → red
const STOPS = [
  [0.0, [48, 18, 59]], [0.2, [70, 107, 227]], [0.4, [40, 188, 235]],
  [0.6, [80, 240, 120]], [0.8, [250, 186, 57]], [1.0, [220, 40, 20]],
];

function colormap(v) {
  for (let i = 1; i < STOPS.length; i++) {
    const [p1, c1] = STOPS[i];
    const [p0, c0] = STOPS[i - 1];
    if (v <= p1) {
      const t = (v - p0) / (p1 - p0);
      return c0.map((c, k) => Math.round(c + (c1[k] - c) * t));
    }
  }
  return STOPS.at(-1)[1];
}

export class Explainer {
  constructor({ img, canvas, words, play, overall, hide, opacity }) {
    Object.assign(this, { img, canvas, wordsEl: words, playBtn: play, overallBtn: overall, hideBtn: hide, opacityInput: opacity });
    this.ctx = canvas.getContext("2d");
    this.data = null;
    this.grid = null; // grid currently drawn
    this.selected = null; // index of the pinned word, or null for "whole caption"
    this.token = 0;
    this.timer = null;

    words.addEventListener("pointerover", (e) => {
      const b = e.target.closest("button[data-i]");
      if (b && !this.timer) this.showWord(Number(b.dataset.i), false);
    });
    words.addEventListener("pointerleave", () => {
      if (!this.timer && this.data) this.selected === null ? this.showOverall() : this.showWord(this.selected, true);
    });
    words.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-i]");
      if (!b) return;
      this.stop();
      this.showWord(Number(b.dataset.i), true);
    });
    play.addEventListener("click", () => (this.timer ? this.stop() : this.play()));
    overall.addEventListener("click", () => {
      this.stop();
      this.showOverall();
    });
    hide.addEventListener("click", () => {
      this.stop();
      this.hideOverlay();
    });
    opacity.addEventListener("input", () => canvas.style.setProperty("--heat", opacity.value));
    canvas.style.setProperty("--heat", opacity.value);
    new ResizeObserver(() => this.grid && this.draw(this.grid)).observe(img);
  }

  reset() {
    this.token++;
    this.stop();
    this.data = null;
    this.grid = null;
    this.selected = null;
    this.hideOverlay();
    this.wordsEl.innerHTML = `<span class="muted">Attention maps will appear here.</span>`;
  }

  async load(imageId, text) {
    const token = ++this.token;
    this.stop();
    this.data = null;
    this.wordsEl.innerHTML = `<span class="muted">Computing attention maps…</span>`;
    try {
      const data = await api.explain(imageId, text);
      if (token !== this.token) return;
      this.data = data;
      this.selected = null;
      this.renderWords();
      if (this.isTabActive()) this.showOverall();
    } catch (err) {
      if (token === this.token) this.wordsEl.innerHTML = `<span class="muted">${escapeHtml(err.message)}</span>`;
    }
  }

  isTabActive() {
    return $('.tab-panel[data-panel="explain"]').classList.contains("active");
  }

  ensureVisible() {
    if (!this.data) return;
    this.selected === null ? this.showOverall() : this.showWord(this.selected, true);
  }

  renderWords() {
    this.wordsEl.innerHTML = this.data.words
      .map((w, i) => `<button type="button" class="${w.stopword ? "stop" : ""}" data-i="${i}" style="animation-delay:${i * 40}ms">${escapeHtml(w.word)}</button>`)
      .join("");
  }

  highlight(i) {
    $$("button", this.wordsEl).forEach((b) => b.classList.toggle("active", Number(b.dataset.i) === i));
    this.overallBtn.classList.toggle("active", i === null);
  }

  showWord(i, pin) {
    if (!this.data?.words[i]) return;
    if (pin) this.selected = i;
    this.highlight(i);
    this.draw(this.data.words[i].map);
  }

  showOverall() {
    if (!this.data) return;
    this.selected = null;
    this.highlight(null);
    this.draw(this.data.overall);
  }

  play() {
    if (!this.data) return;
    const order = this.data.words.map((w, i) => (w.stopword ? -1 : i)).filter((i) => i >= 0);
    if (!order.length) return;
    let k = 0;
    const step = () => {
      this.showWord(order[k % order.length], true);
      k++;
    };
    step();
    this.timer = setInterval(step, reducedMotion() ? 1800 : 1100);
    this.playBtn.innerHTML = `${icon("pause")}Pause`;
    this.playBtn.classList.add("active");
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.playBtn.innerHTML = `${icon("play")}Play`;
    this.playBtn.classList.remove("active");
  }

  hideOverlay() {
    this.canvas.classList.remove("show");
  }

  draw(grid) {
    this.grid = grid;
    const { img, canvas, ctx } = this;
    if (!img.naturalWidth) return;
    const w = img.offsetWidth;
    const h = img.offsetHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    Object.assign(canvas.style, { left: `${img.offsetLeft}px`, top: `${img.offsetTop}px`, width: `${w}px`, height: `${h}px` });
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    // Paint the n×n grid into a tiny bitmap, then let the browser upscale it smoothly.
    const n = grid.length;
    const small = document.createElement("canvas");
    small.width = small.height = n;
    const sctx = small.getContext("2d");
    const pixels = sctx.createImageData(n, n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = grid[y][x];
        const [r, g, b] = colormap(v);
        const o = (y * n + x) * 4;
        pixels.data[o] = r;
        pixels.data[o + 1] = g;
        pixels.data[o + 2] = b;
        pixels.data[o + 3] = Math.round(Math.min(1, Math.max(0, (v - 0.12) / 0.7)) * 255); // faint areas stay clear
      }
    }
    sctx.putImageData(pixels, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.filter = `blur(${Math.round(canvas.width / 90)}px)`;
    ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
    ctx.filter = "none";
    canvas.classList.add("show");
  }
}
