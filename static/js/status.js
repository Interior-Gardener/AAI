// Polls /api/health and keeps the status pill in the navbar up to date.

import { api } from "./api.js";
import { $ } from "./ui.js";

let device = "cpu";
export const getDevice = () => device;

export function initStatus() {
  const pill = $("#statusPill");
  const text = $(".status-text", pill);
  let delay = 2000;

  const poll = async () => {
    try {
      const h = await api.health();
      device = h.device;
      const main = h.models[`caption-${h.default_model}`];
      pill.classList.remove("error");
      if (main.state === "ready") {
        pill.classList.add("ready");
        text.textContent = `Ready · ${h.device.toUpperCase()}`;
        pill.dataset.tip = Object.values(h.models)
          .filter((m) => m.state !== "disabled")
          .map((m) => `${m.label}: ${m.state}`)
          .join(" · ");
        delay = 30000;
      } else if (main.state === "error") {
        pill.classList.add("error");
        text.textContent = "Model error";
        pill.dataset.tip = main.error || "The caption model failed to load. See the server log.";
        delay = 10000;
      } else if (main.state === "idle" && !h.preload) {
        pill.classList.add("ready");
        text.textContent = `Ready · ${h.device.toUpperCase()}`;
        pill.dataset.tip = "Models load on first use (PRELOAD_MODELS=false).";
        delay = 30000;
      } else {
        pill.classList.remove("ready");
        text.textContent = main.state === "loading" ? "Loading AI model…" : "Starting…";
        pill.dataset.tip = "First start downloads the models (~4 GB). Later starts take seconds.";
        delay = 2500;
      }
    } catch {
      pill.classList.remove("ready");
      pill.classList.add("error");
      text.textContent = "Server offline";
      delay = 5000;
    }
    setTimeout(poll, delay);
  };
  poll();
}
