// "Ask" (visual question answering) and "Match" (score your own descriptions) tabs.

import { api } from "./api.js";
import { $, escapeHtml, icon, pct, toast } from "./ui.js";

let getImageId = () => null;
let getCaption = () => "";
let pending = false;

export function initChat(imageIdGetter, captionGetter) {
  getImageId = imageIdGetter;
  getCaption = captionGetter;

  $("#askForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#askInput");
    ask(input.value);
    input.value = "";
  });
  $("#questionChips").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) ask(b.textContent);
  });
  $("#matchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    scoreDescriptions();
  });
}

export function resetChat() {
  $("#chat").innerHTML = `<div class="msg bot"><span class="avatar">${icon("sparkles")}</span><p>Ask me anything about this image — colours, counts, objects, actions…</p></div>`;
  $("#matchResults").innerHTML = "";
}

function addMessage(role, html) {
  const chat = $("#chat");
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;
  msg.innerHTML = role === "bot" ? `<span class="avatar">${icon("sparkles")}</span><p>${html}</p>` : `<p>${html}</p>`;
  chat.append(msg);
  chat.scrollTop = chat.scrollHeight;
  return msg;
}

async function ask(question) {
  question = question.trim();
  if (!question || pending) return;
  const imageId = getImageId();
  if (!imageId) {
    toast("Generate a caption first so the image is on the server.", "info");
    return;
  }
  pending = true;
  addMessage("user", escapeHtml(question));
  const typing = addMessage("bot", "");
  typing.querySelector("p").className = "typing-dots";
  typing.querySelector("p").innerHTML = "<i></i><i></i><i></i>";
  try {
    const res = await api.ask(imageId, question);
    typing.remove();
    const conf = res.confidence !== null ? `<span class="conf">confidence ${pct(res.confidence)} · ${(res.elapsed_ms / 1000).toFixed(1)} s</span>` : "";
    addMessage("bot", `<span class="answer">${escapeHtml(res.answer)}</span>${conf}`);
  } catch (err) {
    typing.remove();
    addMessage("bot", `<span class="bad">${escapeHtml(err.message)}</span>`);
  } finally {
    pending = false;
  }
}

async function scoreDescriptions() {
  const imageId = getImageId();
  if (!imageId) {
    toast("Generate a caption first so the image is on the server.", "info");
    return;
  }
  const lines = $("#matchInput").value.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 7);
  if (!lines.length) {
    toast("Write at least one description.", "info");
    return;
  }
  const caption = getCaption();
  if (caption && !lines.includes(caption)) lines.push(caption);
  const list = $("#matchResults");
  list.innerHTML = `<li class="muted">Scoring ${lines.length} descriptions…</li>`;
  try {
    const { results } = await api.match(imageId, lines);
    list.innerHTML = results
      .map((r, i) => {
        const cls = r.match > 0.7 ? "good" : r.match > 0.3 ? "mid" : "bad";
        const verdict = r.match > 0.7 ? "fits well" : r.match > 0.3 ? "partly fits" : "doesn't fit";
        const tag = r.text === caption ? ` <span class="tag">AI caption</span>` : "";
        return `<li style="animation-delay:${i * 60}ms">
          <div class="row"><span>${escapeHtml(r.text)}${tag}</span><span class="pct ${cls}">${pct(r.match, 1)}</span></div>
          <div class="bar-track"><span style="width:${r.match * 100}%"></span></div>
          <div class="row"><span class="verdict ${cls}">${verdict}</span><small class="muted">similarity ${r.similarity.toFixed(3)}</small></div>
        </li>`;
      })
      .join("");
  } catch (err) {
    list.innerHTML = `<li class="bad">${escapeHtml(err.message)}</li>`;
  }
}
