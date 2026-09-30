// Entry point: wires every module together and registers keyboard shortcuts.

import { initBatch } from "./batch.js";
import { initEffects, runDemoCard } from "./effects.js";
import { initHistory, toggleDrawer } from "./history.js";
import { initStatus } from "./status.js";
import { initStudio, studio } from "./studio.js";
import { $, initRipples, initTooltips } from "./ui.js";

function initTheme() {
  const root = document.documentElement;
  let saved = null;
  try {
    saved = localStorage.getItem("pixelprose.theme");
  } catch {}
  if (!saved) root.dataset.theme = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  const toggle = () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("pixelprose.theme", root.dataset.theme);
    } catch {}
  };
  $("#themeBtn").addEventListener("click", toggle);
  return toggle;
}

function initShortcuts(toggleTheme) {
  const modal = $("#shortcuts");
  const closeModal = () => (modal.hidden = true);
  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.closest("[data-close]")) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    const typing = e.target.closest("input, textarea, [contenteditable]");
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      studio.generate();
      return;
    }
    if (e.key === "Escape") {
      if (!modal.hidden) return closeModal();
      if ($("#drawer").classList.contains("open")) return toggleDrawer(false);
      if (!typing) studio.clear();
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key.toLowerCase()) {
      case "?": modal.hidden = false; break;
      case "h": toggleDrawer(); break;
      case "t": toggleTheme(); break;
      case "r": if (studio.hasResult) studio.generate(); break;
      case "c": if (studio.hasResult) studio.copy(); break;
      case "s": if (studio.hasResult) studio.speak(); break;
      default: return;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const toggleTheme = initTheme();
  initTooltips();
  initRipples();
  initEffects();
  initStatus();
  initStudio();
  initHistory(studio.restore);
  initBatch(studio.settings);
  initShortcuts(toggleTheme);
  runDemoCard();
});
