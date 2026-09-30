// Small, dependency-free UI helpers shared by every module.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export const pct = (v, digits = 0) => (v === null || v === undefined ? "–" : `${(v * 100).toFixed(digits)}%`);
export const seconds = (ms) => (ms / 1000).toFixed(ms < 10000 ? 1 : 0);

export function icon(name) {
  return `<svg><use href="#i-${name}"/></svg>`;
}

/* ---------- Toasts ---------- */
export function toast(message, type = "info", timeout = 3200) {
  const icons = { success: "check", error: "info", info: "sparkles" };
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(icons[type] || "info")}<span>${escapeHtml(message)}</span>`;
  $("#toasts").append(el);
  setTimeout(() => {
    el.classList.add("leave");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }, timeout);
}

/* ---------- Tooltips for [data-tip] ---------- */
export function initTooltips() {
  const tip = $("#tooltip");
  let current = null;
  const show = (target) => {
    current = target;
    tip.textContent = target.dataset.tip;
    const r = target.getBoundingClientRect();
    tip.classList.add("show");
    const w = tip.offsetWidth;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    const top = r.top - tip.offsetHeight - 10;
    tip.style.left = `${left}px`;
    tip.style.top = `${top < 8 ? r.bottom + 10 : top}px`;
  };
  const hide = () => {
    current = null;
    tip.classList.remove("show");
  };
  document.addEventListener("pointerover", (e) => {
    const t = e.target.closest("[data-tip]");
    if (t && t !== current) show(t);
    else if (!t && current) hide();
  });
  document.addEventListener("focusin", (e) => e.target.matches("[data-tip]") && show(e.target));
  document.addEventListener("focusout", hide);
  window.addEventListener("scroll", hide, { passive: true });
}

/* ---------- Tabs with a sliding indicator ---------- */
export function initTabs(container, attr, onChange) {
  const indicator = $(".tab-indicator", container);
  const move = (tab) => {
    if (!indicator || !tab) return;
    indicator.style.width = `${tab.offsetWidth}px`;
    indicator.style.transform = `translateX(${tab.offsetLeft}px)`;
  };
  const select = (tab, silent = false) => {
    $$(".tab", container).forEach((t) => {
      t.classList.toggle("active", t === tab);
      t.setAttribute("aria-selected", t === tab);
    });
    move(tab);
    if (!silent) onChange?.(tab.dataset[attr]);
  };
  container.addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (tab) select(tab);
  });
  const refresh = () => move($(".tab.active", container));
  new ResizeObserver(refresh).observe(container);
  requestAnimationFrame(refresh);
  return {
    select: (value, silent) => select($(`.tab[data-${attr}="${value}"]`, container), silent),
    refresh,
  };
}

/* ---------- Range inputs: coloured fill + live <output> ---------- */
export function initRange(input, format = (v) => v) {
  const out = document.getElementById(`${input.id}Out`);
  const update = () => {
    const p = ((input.value - input.min) / (input.max - input.min)) * 100;
    input.style.setProperty("--fill", `${p}%`);
    if (out) out.textContent = format(input.value);
  };
  input.addEventListener("input", update);
  update();
  return update;
}

/* ---------- Segmented controls ---------- */
export function initSegmented(el, onChange) {
  el.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    $$("button", el).forEach((b) => b.classList.toggle("active", b === btn));
    onChange?.(btn.dataset.value);
  });
  return {
    get value() {
      return $("button.active", el)?.dataset.value;
    },
    set value(v) {
      $$("button", el).forEach((b) => b.classList.toggle("active", b.dataset.value === v));
    },
  };
}

/* ---------- Click ripple for buttons ---------- */
export function initRipples() {
  document.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest(".btn, .chip-btn");
    if (!btn || btn.disabled || reducedMotion()) return;
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height);
    const span = document.createElement("span");
    span.className = "ripple";
    span.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    btn.append(span);
    span.addEventListener("animationend", () => span.remove(), { once: true });
  });
}

/* ---------- Celebration sparkles ---------- */
export function sparkleBurst(el, count = 22) {
  if (reducedMotion()) return;
  const r = el.getBoundingClientRect();
  const colors = ["#8b5cf6", "#22d3ee", "#f472b6", "#fbbf24", "#34d399"];
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = "sparkle";
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const dist = 60 + Math.random() * 90;
    s.style.left = `${r.left + r.width / 2}px`;
    s.style.top = `${r.top + r.height / 2}px`;
    s.style.background = colors[i % colors.length];
    s.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    s.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
    s.style.setProperty("--r", `${Math.random() * 360}deg`);
    document.body.append(s);
    s.addEventListener("animationend", () => s.remove(), { once: true });
  }
}

/* ---------- Word-by-word reveal ---------- */
export function revealWords(el, text, stagger = 55) {
  el.innerHTML = "";
  text.split(" ").forEach((word, i) => {
    const span = document.createElement("span");
    span.className = "w";
    span.textContent = word;
    span.style.animationDelay = `${i * stagger}ms`;
    el.append(span, " ");
  });
}

/* ---------- Typewriter ---------- */
export async function typewrite(el, text, speed = 28, isCancelled = () => false) {
  el.textContent = "";
  for (const ch of text) {
    if (isCancelled()) return;
    el.textContent += ch;
    await sleep(speed + Math.random() * 30);
  }
}

/* ---------- Count-up numbers ---------- */
export function countUp(el, to, duration = 1400, decimals = 0) {
  if (reducedMotion()) {
    el.textContent = to.toFixed(decimals);
    return;
  }
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 4);
    el.textContent = (to * eased).toFixed(decimals);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------- Files ---------- */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = Object.assign(document.createElement("textarea"), { value: text });
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

/** Downscale an image source to a JPEG data URL (used for history thumbnails). */
export function thumbnail(img, maxSide = 480, quality = 0.78) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

/* ---------- Local storage that never throws ---------- */
export const storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};
