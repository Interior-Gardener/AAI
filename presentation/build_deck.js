/**
 * Builds presentation/PixelProse_Presentation.pptx
 *
 *   cd presentation && npm install pptxgenjs react-icons react react-dom sharp
 *   node build_deck.js
 *
 * Screenshots come from docs/images/, benchmark numbers from reports/evaluation.json,
 * and every slide carries its speaker script in the notes (same text as docs/PRESENTATION_GUIDE.md).
 */
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const lu = require("react-icons/lu");

const ROOT = path.resolve(__dirname, "..");
const IMG = (f) => path.join(ROOT, "docs", "images", f);
const ASSET = (f) => path.join(__dirname, "assets", f);
const EVAL = JSON.parse(fs.readFileSync(path.join(ROOT, "reports", "evaluation.json"), "utf8"));

// ---------------------------------------------------------------- design tokens
const C = {
  bg: "0B0A14", card: "15132A", card2: "1C1A36", line: "2E2A4F",
  text: "F1F0FA", muted: "A9A7C0", dim: "74718F",
  violet: "8B5CF6", indigo: "6366F1", cyan: "22D3EE", pink: "F472B6", green: "34D399", amber: "FBBF24",
};
const HEAD = "Arial";
const BODY = "Calibri";
const W = 13.333, H = 7.5, M = 0.6;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "Kartik Verma, Dhir Thakar, Kushal Soni";
pres.title = "PixelProse — Explainable AI Image Caption Generator";

// ---------------------------------------------------------------- helpers
const iconCache = {};
async function icon(name, color = C.violet, size = 256) {
  const key = `${name}-${color}`;
  if (iconCache[key]) return iconCache[key];
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(lu[name], { color: `#${color}`, size: String(size) }));
  const png = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  return (iconCache[key] = "image/png;base64," + png.toString("base64"));
}

async function imgSize(file) {
  const m = await sharp(file).metadata();
  return { w: m.width, h: m.height };
}

/** Place an image inside a box (contain), with a rounded frame behind it. */
async function framedImage(slide, file, x, y, w, h, { frame = true, align = "center" } = {}) {
  const s = await imgSize(file);
  const scale = Math.min(w / s.w, h / s.h);
  const iw = s.w * scale, ih = s.h * scale;
  const ix = align === "left" ? x : align === "right" ? x + w - iw : x + (w - iw) / 2;
  const iy = y + (h - ih) / 2;
  if (frame) {
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: ix - 0.06, y: iy - 0.06, w: iw + 0.12, h: ih + 0.12, rectRadius: 0.12,
      fill: { color: C.card2 }, line: { color: C.line, width: 1 },
      shadow: { type: "outer", color: "000000", blur: 18, offset: 6, angle: 90, opacity: 0.45 },
    });
  }
  slide.addImage({ path: file, x: ix, y: iy, w: iw, h: ih });
  return { x: ix, y: iy, w: iw, h: ih };
}

function bg(slide, kind = "content") {
  slide.background = { path: ASSET(`bg_${kind}.jpg`) };
}

function kicker(slide, text, x = M, y = 0.55) {
  slide.addText(text.toUpperCase(), { x, y, w: 8, h: 0.3, fontFace: HEAD, fontSize: 11, bold: true, color: C.violet, charSpacing: 3, margin: 0, isTextBox: true });
}

function title(slide, text, opts = {}) {
  slide.addText(text, { x: M, y: 0.85, w: W - 2 * M, h: 0.85, fontFace: HEAD, fontSize: 34, bold: true, color: C.text, margin: 0, valign: "top", isTextBox: true, ...opts });
}

function card(slide, x, y, w, h, fill = C.card) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.14, fill: { color: fill }, line: { color: C.line, width: 1 } });
}

async function iconBadge(slide, name, x, y, d = 0.62, color = C.violet) {
  slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color, transparency: 82 }, line: { color, width: 1, transparency: 40 } });
  slide.addImage({ data: await icon(name, color), x: x + d * 0.22, y: y + d * 0.22, w: d * 0.56, h: d * 0.56 });
}

function footer(slide, n) {
  slide.addText([{ text: "PixelProse", options: { bold: true, color: C.muted } }, { text: `   ${n}`, options: { color: C.dim } }],
    { x: W - 2.6, y: H - 0.45, w: 2.1, h: 0.3, fontFace: BODY, fontSize: 10, align: "right", margin: 0, isTextBox: true });
}

const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;

// ---------------------------------------------------------------- slides
async function build() {
  let n = 0;
  const R = EVAL.results;
  const full = R.full, base = R["base-greedy"];

  // 1 — Title --------------------------------------------------------------
  {
    const s = pres.addSlide(); n++;
    bg(s, "title");
    s.addText("ADVANCED ARTIFICIAL INTELLIGENCE  ·  PROJECT PRESENTATION", { x: M, y: 0.8, w: 7, h: 0.3, fontFace: HEAD, fontSize: 11, bold: true, color: C.cyan, charSpacing: 2, margin: 0, isTextBox: true });
    s.addText("PixelProse", { x: M, y: 1.35, w: 6.8, h: 1.3, fontFace: HEAD, fontSize: 72, bold: true, color: C.text, margin: 0, isTextBox: true });
    s.addText("Explainable AI Image Caption Generator", { x: M, y: 2.65, w: 6.6, h: 0.6, fontFace: HEAD, fontSize: 24, color: C.violet, bold: true, margin: 0, isTextBox: true });
    s.addText("Upload any photo → get a human-like caption, see where the AI looked for every word, and ask it questions. Runs fully offline on a laptop.", { x: M, y: 3.4, w: 6.2, h: 0.95, fontFace: BODY, fontSize: 16, color: C.muted, margin: 0, isTextBox: true });
    const names = ["Kartik Verma", "Dhir Thakar", "Kushal Soni"];
    names.forEach((nm, i) => {
      const x = M + i * 2.1;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 4.85, w: 1.95, h: 0.55, rectRadius: 0.27, fill: { color: C.card2 }, line: { color: [C.violet, C.cyan, C.pink][i], width: 1.25 } });
      s.addText(nm, { x, y: 4.85, w: 1.95, h: 0.55, fontFace: BODY, fontSize: 14, bold: true, color: C.text, align: "center", valign: "middle", margin: 0, isTextBox: true });
    });
    s.addText("Computer Engineering  ·  Salesforce BLIP · PyTorch · FastAPI", { x: M, y: 5.65, w: 6.5, h: 0.35, fontFace: BODY, fontSize: 13, color: C.dim, margin: 0, isTextBox: true });
    await framedImage(s, IMG("hero.jpg"), 7.35, 1.2, 5.4, 5.0);
    s.addNotes(`SPEAKER: Kartik Verma  (~50 s)

Good morning everyone. We are Kartik Verma, Dhir Thakar and Kushal Soni, and our Advanced AI project is PixelProse, an explainable image caption generator.

In one line: you give it any photo, and it writes a human-like sentence describing it. More importantly, it can show you where it looked for every word, and it can answer questions about the image.

Everything you'll see today runs locally on this laptop's CPU, with no cloud API. We'll also do a live demo in a few minutes.`);
  }

  // 2 — Problem ------------------------------------------------------------
  {
    const s = pres.addSlide(); n++;
    bg(s); kicker(s, "The problem"); title(s, "Machines need to describe what they see");
    // stat callouts
    const stats = [
      ["2.2 B", "people live with a near or distance vision impairment", "WHO World Report on Vision, 2019", C.violet],
      [">50%", "of the top 1 million home pages contain images with missing alt-text", "WebAIM Million report", C.cyan],
    ];
    stats.forEach(([big, text, src, col], i) => {
      const y = 2.0 + i * 2.2;
      card(s, M, y, 5.6, 2.0);
      s.addText(big, { x: M + 0.35, y: y + 0.15, w: 4.8, h: 0.85, fontFace: HEAD, fontSize: 46, bold: true, color: col, margin: 0, isTextBox: true });
      s.addText(text, { x: M + 0.35, y: y + 0.98, w: 5.0, h: 0.6, fontFace: BODY, fontSize: 14, color: C.text, margin: 0, valign: "top", isTextBox: true });
      s.addText(src, { x: M + 0.35, y: y + 1.62, w: 5.0, h: 0.25, fontFace: BODY, fontSize: 10, italic: true, color: C.dim, margin: 0, isTextBox: true });
    });
    const uses = [
      ["LuAccessibility", "Accessibility", "Automatic alt-text for screen readers"],
      ["LuSearch", "Search & indexing", "Find photos by what's in them"],
      ["LuShare2", "Social & content", "Captions, hashtags and moderation"],
      ["LuBot", "Robotics & assistants", "Describe surroundings in real time"],
    ];
    s.addText("Where captioning is used", { x: 6.9, y: 2.0, w: 5.8, h: 0.4, fontFace: HEAD, fontSize: 18, bold: true, color: C.text, margin: 0, isTextBox: true });
    for (let i = 0; i < uses.length; i++) {
      const [ic, h, d] = uses[i];
      const y = 2.6 + i * 0.95;
      await iconBadge(s, ic, 6.9, y, 0.62, [C.violet, C.cyan, C.pink, C.amber][i]);
      s.addText(h, { x: 7.75, y: y - 0.02, w: 4.9, h: 0.35, fontFace: HEAD, fontSize: 16, bold: true, color: C.text, margin: 0, isTextBox: true });
      s.addText(d, { x: 7.75, y: y + 0.32, w: 4.9, h: 0.3, fontFace: BODY, fontSize: 13, color: C.muted, margin: 0, isTextBox: true });
    }
    s.addText("It combines two hard problems: computer vision (understand the scene) + natural language generation (say it fluently).",
      { x: 6.9, y: 6.35, w: 5.8, h: 0.6, fontFace: BODY, fontSize: 13, italic: true, color: C.cyan, margin: 0, isTextBox: true });
    footer(s, n);
    s.addNotes(`SPEAKER: Kartik Verma  (~60 s)

Why does this matter? According to the WHO, at least 2.2 billion people live with a vision impairment. They rely on screen readers, and screen readers rely on alt-text, a written description of every image. Yet more than half of the web's most popular home pages have images with no alt-text at all.

Beyond accessibility, automatic captions power image search, social media and content moderation, and robots or smart assistants that need to describe what they see.

Describing an image sounds trivial for a human, but for a computer it combines two hard problems: computer vision to understand the scene, and natural language generation to express it fluently.`);
  }

  // 3 — Objectives ---------------------------------------------------------
  {
    const s = pres.addSlide(); n++;
    bg(s); kicker(s, "Objectives"); title(s, "What we set out to build");
    const goals = [
      ["LuTarget", "Accurate captions", "Grounded, fluent sentences, not just plausible ones"],
      ["LuEye", "Explainable", "Show where the model looked for every word"],
      ["LuMessageSquare", "Interactive", "Ask follow-up questions about the image"],
      ["LuPalette", "Beautiful & usable", "Modern, animated, responsive, accessible UI"],
      ["LuLaptop", "Runs on a laptop", "Offline, private, no GPU or paid API required"],
      ["LuChartBar", "Measurable", "Benchmark with BLEU, ROUGE-L and CIDEr-D"],
    ];
    const cw = 3.85, ch = 2.1;
    for (let i = 0; i < goals.length; i++) {
      const [ic, h, d] = goals[i];
      const x = M + (i % 3) * (cw + 0.29), y = 2.0 + Math.floor(i / 3) * (ch + 0.3);
      card(s, x, y, cw, ch);
      await iconBadge(s, ic, x + 0.3, y + 0.3, 0.66, [C.violet, C.cyan, C.pink][i % 3]);
      s.addText(`0${i + 1}`, { x: x + cw - 0.9, y: y + 0.3, w: 0.6, h: 0.35, fontFace: HEAD, fontSize: 14, bold: true, color: C.dim, align: "right", margin: 0, isTextBox: true });
      s.addText(h, { x: x + 0.3, y: y + 1.1, w: cw - 0.6, h: 0.4, fontFace: HEAD, fontSize: 18, bold: true, color: C.text, margin: 0, isTextBox: true });
      s.addText(d, { x: x + 0.3, y: y + 1.5, w: cw - 0.6, h: 0.45, fontFace: BODY, fontSize: 13, color: C.muted, margin: 0, isTextBox: true });
    }
    footer(s, n);
    s.addNotes(`SPEAKER: Kartik Verma  (~45 s)

We set ourselves six goals.
One: captions that are genuinely accurate, not just plausible.
Two: explainability, because the AI shouldn't be a black box.
Three: interactivity, so you can ask follow-up questions.
Four: a clean, modern interface that anyone can use.
Five: it must run on an ordinary student laptop without a GPU or paid API.
And six: we wanted to measure quality with the standard research metrics instead of just claiming it's good.`);
  }

  // 4 — Meet PixelProse ----------------------------------------------------
  {
    const s = pres.addSlide(); n++;
    bg(s); kicker(s, "The product"); title(s, "Meet PixelProse");
    await framedImage(s, IMG("studio_result.jpg"), M, 1.85, 7.7, 5.1, { align: "left" });
    const rows = [
      ["LuSparkles", "Caption", "Accurate sentence + confidence + image-match score", C.violet],
      ["LuEye", "Explain", "Per-word attention heatmaps over the photo", C.cyan],
      ["LuMessageSquare", "Ask", "Chat with the image — visual question answering", C.pink],
      ["LuScale", "Match", "Score any description against the image", C.amber],
    ];
    for (let i = 0; i < rows.length; i++) {
      const [ic, h, d, col] = rows[i];
      const y = 2.0 + i * 1.18;
      await iconBadge(s, ic, 8.75, y, 0.66, col);
      s.addText(h, { x: 9.6, y: y - 0.02, w: 3.2, h: 0.38, fontFace: HEAD, fontSize: 18, bold: true, color: C.text, margin: 0, isTextBox: true });
      s.addText(d, { x: 9.6, y: y + 0.36, w: 3.2, h: 0.6, fontFace: BODY, fontSize: 13, color: C.muted, margin: 0, valign: "top", isTextBox: true });
    }
    s.addText("5 ways in: upload · drag & drop · paste · URL · webcam  (+ 44 samples)", { x: 8.75, y: 6.6, w: 4.1, h: 0.35, fontFace: BODY, fontSize: 11, italic: true, color: C.cyan, margin: 0, isTextBox: true });
    footer(s, n);
    s.addNotes(`SPEAKER: Kartik Verma  (~50 s)

This is PixelProse. On the left you pick an image: upload, drag and drop, paste, a URL, your webcam, or one of 44 built-in samples.

On the right you get the caption, with a confidence score and an independent image-match score.

Then there are four tabs. Candidates shows every sentence the model considered. Explain shows attention heatmaps. Ask is a chat for questions. Match lets you test your own descriptions.

Dhir will show all of this live in a few minutes.`);
  }

  // 5 — Architecture ---------------------------------------------------------
  {
    const s = pres.addSlide(); n++;
    bg(s); kicker(s, "System design"); title(s, "Architecture");
    const box = (x, y, w, h, head, sub, col) => {
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: C.card }, line: { color: col, width: 1.5 } });
      s.addText([{ text: head, options: { bold: true, color: C.text, fontSize: 15, breakLine: true } }, { text: sub, options: { color: C.muted, fontSize: 11 } }],
        { x: x + 0.15, y, w: w - 0.3, h, fontFace: BODY, align: "center", valign: "middle", margin: 0, isTextBox: true });
    };
    // Shape sizes must never be negative (PowerPoint "repairs" the file and drops content),
    // so an upward arrow is drawn top-down and flipped vertically.
    const arrow = (x1, y1, x2, y2) => s.addShape(pres.shapes.LINE, {
      x: x1, y: Math.min(y1, y2), w: x2 - x1, h: Math.max(Math.abs(y2 - y1), 0.001), flipV: y2 < y1,
      line: { color: C.dim, width: 1.5, endArrowType: "triangle" },
    });
    // columns
    s.addText("FRONTEND", { x: M, y: 1.85, w: 2.6, h: 0.3, fontFace: HEAD, fontSize: 11, bold: true, color: C.cyan, charSpacing: 2, margin: 0, isTextBox: true });
    s.addText("API SERVER", { x: 3.75, y: 1.85, w: 2.6, h: 0.3, fontFace: HEAD, fontSize: 11, bold: true, color: C.violet, charSpacing: 2, margin: 0, isTextBox: true });
    s.addText("SERVICES", { x: 6.9, y: 1.85, w: 2.6, h: 0.3, fontFace: HEAD, fontSize: 11, bold: true, color: C.pink, charSpacing: 2, margin: 0, isTextBox: true });
    s.addText("MODELS (PyTorch)", { x: 10.05, y: 1.85, w: 2.7, h: 0.3, fontFace: HEAD, fontSize: 11, bold: true, color: C.amber, charSpacing: 2, margin: 0, isTextBox: true });

    box(M, 2.25, 2.6, 1.3, "Web UI", "HTML · CSS · JS modules\nno build step", C.cyan);
    box(M, 3.75, 2.6, 1.0, "Heatmap canvas", "Grad-CAM rendering", C.cyan);
    box(M, 4.95, 2.6, 1.0, "Browser storage", "history · settings · theme", C.cyan);

    box(3.75, 2.25, 2.6, 2.2, "FastAPI", "REST + OpenAPI docs\nvalidation · errors\nGZip · static hosting", C.violet);
    box(3.75, 4.65, 2.6, 1.3, "LRU caches", "images by SHA-1\ndeterministic results", C.violet);

    box(6.9, 2.25, 2.6, 0.8, "Captioner", "encode · decode · score", C.pink);
    box(6.9, 3.2, 2.6, 0.8, "Matcher", "ITM · ITC · Grad-CAM", C.pink);
    box(6.9, 4.15, 2.6, 0.8, "QuestionAnswerer", "visual Q&A", C.pink);
    box(6.9, 5.1, 2.6, 0.85, "Model Manager", "lazy load · device · locks", C.pink);

    const models = [["BLIP-large captioner", "ViT-L/16 · 446M"], ["BLIP-base captioner", "ViT-B/16 · fast mode"], ["BLIP ITM", "matching · 224M"], ["BLIP VQA", "questions · 361M"]];
    models.forEach(([h, d], i) => box(10.05, 2.25 + i * 0.93, 2.7, 0.8, h, d, C.amber));

    arrow(3.2, 2.9, 3.75, 2.9); arrow(3.2, 4.25, 3.75, 3.6);
    arrow(6.35, 2.65, 6.9, 2.65); arrow(6.35, 3.6, 6.9, 3.6); arrow(6.35, 4.2, 6.9, 4.55);
    arrow(9.5, 5.5, 10.05, 5.0); arrow(9.5, 5.5, 10.05, 4.1); arrow(9.5, 5.5, 10.05, 3.2); arrow(9.5, 5.5, 10.05, 2.65);
    s.addText("JSON / multipart over HTTP  ·  image uploaded once, then referenced by a 40-char id  ·  CUDA → Apple MPS → CPU auto-selection",
      { x: M, y: 6.3, w: W - 2 * M, h: 0.4, fontFace: BODY, fontSize: 12, italic: true, color: C.muted, margin: 0, isTextBox: true });
    footer(s, n);
    s.addNotes(`SPEAKER: Kartik Verma  (~60 s)

Under the hood there are three layers.

The frontend is plain HTML, CSS and JavaScript modules, so there is no build step and it's easy to run anywhere.

It talks over a REST API to a FastAPI server written in Python. FastAPI validates every request and also generates interactive API documentation automatically.

The server has independent services: the Captioner, the Matcher, the question answerer and image utilities. A Model Manager loads four transformer networks lazily, picks the best device (NVIDIA GPU, Apple Silicon or CPU), and makes sure requests don't fight over the processor.

Caches mean an image is uploaded once, and repeated requests are instant.

HANDOVER: "Now Kushal will explain the AI model itself."`);
  }

  // 6 — Inside BLIP --------------------------------------------------------
  {
    const s = pres.addSlide(); n++;
    bg(s); kicker(s, "The model"); title(s, "Inside BLIP: vision meets language");
    s.addText("Bootstrapping Language-Image Pre-training · Li et al., Salesforce Research · ICML 2022", { x: M, y: 1.62, w: 10, h: 0.3, fontFace: BODY, fontSize: 13, italic: true, color: C.muted, margin: 0, isTextBox: true });
    const steps = [
      ["LuImage", "Image", "resized to\n384 × 384", C.cyan],
      ["LuGrid3X3", "576 patches", "16 × 16 px each\n(a 24 × 24 grid)", C.cyan],
      ["LuCpu", "Vision Transformer", "ViT-L/16 · 24 layers\nself-attention", C.violet],
      ["LuLayers", "Image embeddings", "577 vectors ×\n1024 numbers", C.violet],
      ["LuSparkles", "Text decoder", "12-layer BERT · writes\nword by word with\ncross-attention", C.pink],
    ];
    const sw = 2.2, gap = 0.28;
    for (let i = 0; i < steps.length; i++) {
      const [ic, h, d, col] = steps[i];
      const x = M + i * (sw + gap), y = 2.25;
      card(s, x, y, sw, 2.35);
      await iconBadge(s, ic, x + (sw - 0.7) / 2, y + 0.25, 0.7, col);
      s.addText(h, { x: x + 0.1, y: y + 1.05, w: sw - 0.2, h: 0.4, fontFace: HEAD, fontSize: 14, bold: true, color: C.text, align: "center", margin: 0, isTextBox: true });
      s.addText(d, { x: x + 0.1, y: y + 1.45, w: sw - 0.2, h: 0.8, fontFace: BODY, fontSize: 12, color: C.muted, align: "center", valign: "top", margin: 0, isTextBox: true });
      if (i < steps.length - 1) s.addImage({ data: await icon("LuArrowRight", C.dim), x: x + sw + 0.02, y: y + 1.0, w: 0.24, h: 0.24 });
    }
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: 4.85, w: W - 2 * M, h: 0.7, rectRadius: 0.1, fill: { color: C.card2 }, line: { color: C.pink, width: 1 } });
    s.addText([{ text: "Output:  ", options: { color: C.pink, bold: true } }, { text: "“a woman sitting on a beach next to a dog”", options: { color: C.text } }],
      { x: M + 0.3, y: 4.85, w: W - 2 * M - 0.6, h: 0.7, fontFace: BODY, fontSize: 18, valign: "middle", margin: 0, isTextBox: true });
    const facts = [["129M", "image-text pairs in pre-training"], ["446M", "parameters (large captioner)"], ["CapFilt", "synthetic captions + noise filter"]];
    facts.forEach(([b, t], i) => {
      const x = M + i * 4.1;
      s.addText(b, { x, y: 5.85, w: 1.7, h: 0.6, fontFace: HEAD, fontSize: 28, bold: true, color: [C.violet, C.cyan, C.pink][i], margin: 0, valign: "middle", isTextBox: true });
      s.addText(t, { x: x + 1.7, y: 5.85, w: 2.3, h: 0.6, fontFace: BODY, fontSize: 13, color: C.muted, margin: 0, valign: "middle", isTextBox: true });
    });
    footer(s, n);
    s.addNotes(`SPEAKER: Kushal Soni  (~70 s)

Our core model is BLIP, "Bootstrapping Language-Image Pre-training", published by Salesforce Research at ICML 2022. It has two halves.

First, a Vision Transformer. The image is resized to 384 by 384 and cut into 576 small patches of 16 by 16 pixels, a 24 by 24 grid. Each patch becomes a vector, and 24 layers of self-attention let every patch look at every other patch. The output is 577 vectors of 1024 numbers each (576 patches plus one global token), a numeric "understanding" of the image.

Second, a text decoder similar to BERT writes the caption one word at a time. At every word it uses cross-attention to look back at the image patches.

BLIP was pre-trained on 129 million image-text pairs. Its key trick, CapFilt, uses a captioner to write synthetic captions and a filter to throw away noisy web captions, which cleans the training data.

The large model we use has 446 million parameters.`);
  }

  // 7 — Pipeline -------------------------------------------------------------
  {
    const s = pres.addSlide(); n++;
    bg(s); kicker(s, "Our contribution"); title(s, "A caption pipeline, not a single guess");
    const steps = [
      ["1", "Encode once", "ViT runs a single time; every candidate reuses the embeddings"],
      ["2", "Generate drafts", "Beam search keeps the 5 best sentences; Detailed mode adds nucleus sampling (p = 0.9)"],
      ["3", "Clean & dedupe", "Strip prompt & artefacts, block repeats (no-repeat 3-grams)"],
      ["4", "Score every word", "One batched pass → token probabilities → confidence = 1 / perplexity"],
      ["5", "Fact-check & re-rank", "Image-Text Matching model re-reads each draft with the image"],
    ];
    for (let i = 0; i < steps.length; i++) {
      const [num, h, d] = steps[i];
      const y = 1.95 + i * 0.86;
      s.addShape(pres.shapes.OVAL, { x: M, y, w: 0.6, h: 0.6, fill: { color: [C.violet, C.indigo, C.cyan, C.pink, C.amber][i] }, line: { type: "none" } });
      s.addText(num, { x: M, y, w: 0.6, h: 0.6, fontFace: HEAD, fontSize: 18, bold: true, color: C.bg, align: "center", valign: "middle", margin: 0, isTextBox: true });
      s.addText(h, { x: M + 0.85, y: y - 0.04, w: 5.5, h: 0.34, fontFace: HEAD, fontSize: 16, bold: true, color: C.text, margin: 0, isTextBox: true });
      s.addText(d, { x: M + 0.85, y: y + 0.3, w: 6.3, h: 0.5, fontFace: BODY, fontSize: 12.5, color: C.muted, margin: 0, valign: "top", isTextBox: true });
    }
    card(s, 7.85, 1.95, 4.9, 2.2, C.card2);
    s.addText("Final score", { x: 8.15, y: 2.1, w: 4.3, h: 0.35, fontFace: HEAD, fontSize: 14, bold: true, color: C.violet, margin: 0, isTextBox: true });
    s.addText([
      { text: "0.65", options: { color: C.cyan, bold: true } }, { text: " × image-match", options: { color: C.text, breakLine: true } },
      { text: "+ 0.35", options: { color: C.pink, bold: true } }, { text: " × confidence", options: { color: C.text } },
    ], { x: 8.15, y: 2.55, w: 4.4, h: 1.0, fontFace: HEAD, fontSize: 24, margin: 0, valign: "top", isTextBox: true });
    s.addText("Fluent and grounded in the picture: the model writes drafts, a second model fact-checks them.", { x: 8.15, y: 3.5, w: 4.4, h: 0.55, fontFace: BODY, fontSize: 12, italic: true, color: C.muted, margin: 0, isTextBox: true });
    card(s, 7.85, 4.35, 4.9, 2.55);
    s.addText("Real example: re-ranked drafts", { x: 8.1, y: 4.45, w: 4.4, h: 0.35, fontFace: HEAD, fontSize: 13, bold: true, color: C.text, margin: 0, isTextBox: true });
    const ex = [["a woman sitting on a beach next to a dog", "84.2", C.cyan], ["a woman sitting on the beach with a dog", "84.0", C.muted], ["a woman sitting on a beach with a dog", "83.8", C.muted], ["a woman and her dog on the beach", "81.0", C.muted]];
    ex.forEach(([t, sc, col], i) => {
      const y = 4.9 + i * 0.47;
      s.addText(`${i + 1}. ${t}`, { x: 8.1, y, w: 3.75, h: 0.4, fontFace: BODY, fontSize: 11.5, color: col, bold: i === 0, margin: 0, valign: "middle", isTextBox: true });
      s.addText(sc, { x: 11.85, y, w: 0.65, h: 0.4, fontFace: "Courier New", fontSize: 12, color: col, bold: i === 0, align: "right", margin: 0, valign: "middle", isTextBox: true });
    });
    footer(s, n);
    s.addNotes(`SPEAKER: Kushal Soni  (~70 s)

We didn't just call the model once. We built a pipeline around it.

Step one: encode the image only once. That's the expensive part, so we reuse it.
Step two: generate several candidate sentences. Beam search keeps the 5 most probable partial sentences at every step, which is accurate. In the Detailed mode we also add nucleus sampling, which picks words from the top 90% of the probability mass: more varied and natural.
Step three: clean them and remove duplicates. We also block repeated phrases like "a dog and a dog".
Step four: score every word's probability in a single batched pass. That gives us a confidence value, which is the inverse of perplexity.
Step five: a second network, the Image-Text Matching model, re-reads each sentence together with the image and says how well they match.

The final score is 65% match plus 35% confidence, so the winner is both fluent AND grounded in the picture. It's like having the model write several drafts and asking a fact-checker to pick the best one.

HANDOVER: "Dhir will now show how we made the AI explain itself."`);
  }

  // 8 — Explainability -----------------------------------------------------
  {
    const s = pres.addSlide(); n++;
    bg(s); kicker(s, "Explainable AI"); title(s, "Where did the model look?");
    const a = await framedImage(s, IMG("heat_dog.jpg"), M, 1.95, 3.9, 2.9);
    s.addText("“dog”", { x: a.x, y: a.y + a.h + 0.12, w: a.w, h: 0.35, fontFace: HEAD, fontSize: 16, bold: true, color: C.cyan, align: "center", margin: 0, isTextBox: true });
    const b = await framedImage(s, IMG("heat_woman.jpg"), M + 4.2, 1.95, 3.9, 2.9);
    s.addText("“woman”", { x: b.x, y: b.y + b.h + 0.12, w: b.w, h: 0.35, fontFace: HEAD, fontSize: 16, bold: true, color: C.pink, align: "center", margin: 0, isTextBox: true });
    card(s, 9.1, 1.95, 3.65, 4.95, C.card2);
    s.addText("Grad-CAM on cross-attention", { x: 9.35, y: 2.1, w: 3.2, h: 0.4, fontFace: HEAD, fontSize: 15, bold: true, color: C.text, margin: 0, isTextBox: true });
    s.addText([
      { text: "Take the attention between each word and the 576 image patches (layer 8).", options: { bullet: true, breakLine: true } },
      { text: "Weight it by the gradient of the match score (how much it mattered).", options: { bullet: true, breakLine: true } },
      { text: "Keep the positive part → a 24 × 24 heatmap per word.", options: { bullet: true, breakLine: true } },
      { text: "Rendered in the browser with a colour map; hover a word or press Play.", options: { bullet: true } },
    ], { x: 9.35, y: 2.55, w: 3.25, h: 2.9, fontFace: BODY, fontSize: 13, color: C.muted, paraSpaceAfter: 8, valign: "top", margin: 0, isTextBox: true });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 9.35, y: 5.6, w: 3.15, h: 1.05, rectRadius: 0.08, fill: { color: C.bg }, line: { color: C.line, width: 1 } });
    s.addText("CAM = mean_heads( A ⊙ ReLU(∂s/∂A) )", { x: 9.35, y: 5.6, w: 3.15, h: 1.05, fontFace: "Courier New", fontSize: 12, bold: true, color: C.cyan, align: "center", valign: "middle", margin: 0, isTextBox: true });
    s.addText("Plus a per-word probability chart: orange bars mark words where the model hesitated.", { x: M, y: 5.65, w: 8.1, h: 0.6, fontFace: BODY, fontSize: 13, italic: true, color: C.muted, margin: 0, isTextBox: true });
    footer(s, n);
    s.addNotes(`SPEAKER: Dhir Thakar  (~60 s)

A common criticism of deep learning is that it's a black box. PixelProse opens the box.

For every word in the caption we compute a heatmap with Grad-CAM. We take the cross-attention between the word and the 576 image patches, and weight it by the gradient of the match score, which tells us how much that attention actually mattered for the decision.

Look: for the word "dog", the dog lights up. For "woman", the heat moves to her. These maps are real outputs from our app.

The app also shows a bar chart of how confident the model was about each individual word. Orange bars mark words where it hesitated.`);
  }

  // 9 — Ask & Match ----------------------------------------------------------
  {
    const s = pres.addSlide(); n++;
    bg(s); kicker(s, "Interact with the image"); title(s, "Ask questions. Test descriptions.");
    await framedImage(s, IMG("ask_crop.jpg"), M, 1.9, 5.9, 4.3);
    await framedImage(s, IMG("match_crop.jpg"), 6.85, 1.9, 5.9, 4.3);
    s.addText([{ text: "Ask · ", options: { bold: true, color: C.pink } }, { text: "BLIP-VQA encodes the question together with the image, then generates a short answer.", options: { color: C.muted } }],
      { x: M, y: 6.35, w: 5.9, h: 0.6, fontFace: BODY, fontSize: 13, margin: 0, valign: "top", isTextBox: true });
    s.addText([{ text: "Match · ", options: { bold: true, color: C.amber } }, { text: "ITM probability + ITC cosine similarity for any sentence you type.", options: { color: C.muted } }],
      { x: 6.85, y: 6.35, w: 5.9, h: 0.6, fontFace: BODY, fontSize: 13, margin: 0, valign: "top", isTextBox: true });
    footer(s, n);
    s.addNotes(`SPEAKER: Dhir Thakar  (~50 s)

The Ask tab uses a third network, BLIP-VQA, for Visual Question Answering. It encodes your question together with the image, and a decoder generates a short answer. For example: "What is the woman wearing?" gives "plaid shirt", and "Is the dog happy?" gives "yes", each with a confidence.

The Match tab turns the matching model into a playground. Type any descriptions and it scores each one. A correct description scores near 100%, a wrong one like "a cat sleeping on a sofa" scores 0%. Notice "a dog giving a high five" gets 29%: partly right, since it misses the woman. The model is genuinely reading the whole scene. It's a great way to probe what the model really understands, and we'll let you try it in the demo.`);
  }

  // 10 — Feature grid --------------------------------------------------------
  {
    const s = pres.addSlide(); n++;
    bg(s); kicker(s, "Everything included"); title(s, "Features beyond the caption");
    const feats = [
      ["LuWandSparkles", "Guided captions", "“a painting of…” prefixes"],
      ["LuZap", "Fast / accurate switch", "BLIP-base vs BLIP-large"],
      ["LuHash", "Keywords & hashtags", "one click to copy"],
      ["LuPalette", "Colour palette", "dominant colours + hex"],
      ["LuAccessibility", "Alt-text HTML", "ready for websites"],
      ["LuVolume2", "Text-to-speech", "reads captions aloud"],
      ["LuDownload", "Caption card", "shareable 1080×1350 PNG"],
      ["LuImages", "Batch mode", "12 images → CSV / JSON"],
      ["LuHistory", "History", "last 30 results, restorable"],
      ["LuCamera", "Webcam capture", "snap and caption"],
      ["LuCode", "REST API + docs", "Swagger UI at /docs"],
      ["LuTerminal", "Command line", "python cli.py folder/"],
    ];
    const cw = 2.85, ch = 1.18;
    for (let i = 0; i < feats.length; i++) {
      const [ic, h, d] = feats[i];
      const x = M + (i % 4) * (cw + 0.17), y = 1.95 + Math.floor(i / 4) * (ch + 0.2);
      card(s, x, y, cw, ch);
      await iconBadge(s, ic, x + 0.2, y + 0.26, 0.62, [C.violet, C.cyan, C.pink, C.amber][i % 4]);
      s.addText(h, { x: x + 0.95, y: y + 0.24, w: cw - 1.05, h: 0.35, fontFace: HEAD, fontSize: 13, bold: true, color: C.text, margin: 0, isTextBox: true });
      s.addText(d, { x: x + 0.95, y: y + 0.6, w: cw - 1.05, h: 0.35, fontFace: BODY, fontSize: 11, color: C.muted, margin: 0, isTextBox: true });
    }
    s.addText("22 features in total: see docs/FEATURES.md", { x: M, y: 6.25, w: 8, h: 0.35, fontFace: BODY, fontSize: 12, italic: true, color: C.dim, margin: 0, isTextBox: true });
    footer(s, n);
    s.addNotes(`SPEAKER: Dhir Thakar  (~50 s)

Beyond the core AI we added a lot of practical features:
guided captions like "a painting of…", a fast/accurate model switch, keywords and hashtags, the image's colour palette, accessible alt-text HTML ready to paste into a website, text-to-speech, a downloadable caption card for social media, batch mode for up to 12 images with CSV or JSON export, a history drawer, webcam capture, a REST API with interactive documentation, and a command-line tool.

All 22 features are documented in docs/FEATURES.md.`);
  }

  // 11 — Design & UX ---------------------------------------------------------
  {
    const s = pres.addSlide(); n++;
    bg(s); kicker(s, "Design & experience"); title(s, "Built to be a joy to use");
    await framedImage(s, IMG("explain_dog.jpg"), M, 1.9, 6.4, 3.35, { align: "left" });
    await framedImage(s, IMG("light_theme.jpg"), M, 5.4, 3.1, 1.6, { align: "left" });
    await framedImage(s, IMG("batch.jpg"), M + 3.3, 5.4, 3.1, 1.6, { align: "left" });
    await framedImage(s, IMG("mobile_hero.jpg"), 7.2, 1.9, 1.95, 5.1);
    const pts = [
      "Glassmorphism + animated aurora, dark & light themes",
      "Scanning beam over the ViT's 24×24 patch grid while the AI works",
      "Live pipeline checklist and neural-net loader",
      "Word-by-word caption reveal, animated score rings",
      "Responsive down to phones; reduced-motion support",
      "Keyboard shortcuts, focus states, ARIA labels",
    ];
    s.addText(pts.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < pts.length - 1 } })),
      { x: 9.45, y: 1.95, w: 3.3, h: 5.0, fontFace: BODY, fontSize: 13, color: C.muted, paraSpaceAfter: 10, valign: "top", margin: 0, isTextBox: true });
    footer(s, n);
    s.addNotes(`SPEAKER: Dhir Thakar  (~50 s)

We treated the interface as seriously as the model. It's a glassmorphism design with dark and light themes, and it's fully responsive, so it even works on a phone.

Every wait is visualised: while the AI works, a scanning beam sweeps the image over a 24 by 24 grid, which is exactly how the Vision Transformer sees it, and a live checklist shows each stage of the pipeline.

We also respected accessibility: keyboard shortcuts, visible focus states, screen-reader labels and reduced-motion support for people who get motion sickness.

Now let's see it live.`);
  }

  // 12 — Live demo -----------------------------------------------------------
  {
    const s = pres.addSlide(); n++;
    bg(s, "section");
    s.addImage({ data: await icon("LuPlay", C.text), x: W / 2 - 0.45, y: 1.2, w: 0.9, h: 0.9 });
    s.addText("Live demo", { x: 0, y: 2.25, w: W, h: 1.1, fontFace: HEAD, fontSize: 60, bold: true, color: C.text, align: "center", margin: 0, isTextBox: true });
    s.addText("http://127.0.0.1:8000", { x: 0, y: 3.35, w: W, h: 0.45, fontFace: "Courier New", fontSize: 18, color: C.cyan, align: "center", margin: 0, isTextBox: true });
    const steps = ["Sample → Generate", "Candidates", "Explain heatmaps", "Ask questions", "Match descriptions", "A fresh photo", "Guided + fast mode", "Speak & card"];
    steps.forEach((t, i) => {
      const x = 1.1 + (i % 4) * 2.85, y = 4.3 + Math.floor(i / 4) * 0.85;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 2.6, h: 0.6, rectRadius: 0.3, fill: { color: C.bg, transparency: 30 }, line: { color: C.line, width: 1 } });
      s.addText([{ text: `${i + 1}  `, options: { color: C.violet, bold: true } }, { text: t, options: { color: C.text } }], { x, y, w: 2.6, h: 0.6, fontFace: BODY, fontSize: 13, align: "center", valign: "middle", margin: 0, isTextBox: true });
    });
    s.addNotes(`SPEAKER: Dhir Thakar presents · Kartik Verma drives the laptop  (~5 min)

Follow the run-sheet in docs/PRESENTATION_GUIDE.md, section 4:
1. Samples → people → "woman and dog on beach" → Generate. Point out the scanning 24×24 grid.
2. Read the caption and the 99.7% image match. Open Candidates and click the 2nd candidate.
3. Explain tab: hover "dog", then "woman", then "beach", then press Play. Pause and let the audience watch.
4. Ask: "what is the woman wearing?" and the chip "How many people are there?"
5. Match: "a cat sleeping on a sofa" vs "a woman playing with her dog".
6. Drag in a FRESH photo taken today from the desktop → Generate.
7. Settings: prefix "a painting of", Base model → Generate.
8. Speak, then download the Card. Optional: T for theme, H for history, the /docs tab.

If anything fails: switch to Base model, or go back to slides 4, 8 and 9 (they show real screenshots).`);
  }

  // 13 — Evaluation ------------------------------------------------------------
  {
    const s = pres.addSlide(); n++;
    bg(s); kicker(s, "Evaluation"); title(s, "Measured, not just claimed");
    const keys = ["base-greedy", "large-greedy", "large-beam5", "beam-rerank", "full"];
    const names = ["Base greedy", "Large greedy", "Large beam-5", "Balanced*", "Detailed"];
    const longNames = ["Base · greedy", "Large · greedy", "Large · beam 5", "Balanced (default)", "Detailed (hybrid)"];
    s.addChart(pres.charts.BAR, [{ name: "CIDEr-D", labels: names, values: keys.map((k) => +R[k]["CIDEr-D"].toFixed(3)) }], {
      x: M, y: 1.8, w: 6.2, h: 4.45, barDir: "col",
      chartColors: [C.dim, C.dim, C.indigo, C.violet, C.cyan], varyColors: true, showValue: true, dataLabelPosition: "outEnd",
      dataLabelColor: C.text, dataLabelFontSize: 11, dataLabelFormatCode: "0.00",
      catAxisLabelColor: C.muted, valAxisLabelColor: C.dim, catAxisLabelFontSize: 10, valAxisLabelFontSize: 9,
      valAxisMinVal: 1.5, valAxisMaxVal: 2.05, valAxisMajorUnit: 0.1, valAxisLabelFormatCode: "0.0",
      valGridLine: { color: "2A2745", size: 0.5 }, catGridLine: { style: "none" }, showLegend: false,
      showTitle: true, title: "CIDEr-D, main COCO metric (higher is better)", titleColor: C.text, titleFontSize: 12,
    });
    const hdr = ["Configuration", "BLEU-4", "CIDEr-D", "Match", "sec"].map((t) => ({ text: t, options: { bold: true, color: C.text, fill: { color: C.card2 } } }));
    const rows = keys.map((k, i) => {
      const r = R[k];
      const o = { color: k === "beam-rerank" ? C.cyan : C.muted, bold: k === "beam-rerank" };
      return [longNames[i], r["BLEU-4"].toFixed(3), r["CIDEr-D"].toFixed(3), pct(r["ITM match"], 0), r["sec / image"].toFixed(1)].map((t) => ({ text: String(t), options: o }));
    });
    s.addTable([hdr, ...rows], { x: 7.05, y: 1.85, w: 5.7, colW: [2.05, 0.9, 0.95, 0.9, 0.9], fontFace: BODY, fontSize: 11, border: { type: "solid", color: C.line, pt: 0.75 }, fill: { color: C.card }, rowH: 0.38, valign: "middle" });
    const bal = R["beam-rerank"], beam = R["large-beam5"], det = R.full;
    const gain = ((beam["CIDEr-D"] / base["CIDEr-D"] - 1) * 100).toFixed(0);
    card(s, 7.05, 4.3, 5.7, 1.95, C.card2);
    s.addText([
      { text: "What we learned", options: { bold: true, color: C.violet, fontSize: 15, breakLine: true } },
      { text: `Beam search: +${gain}% CIDEr-D over the baseline.`, options: { bullet: true, color: C.text, fontSize: 12, breakLine: true } },
      { text: `ITM re-ranking keeps that score and lifts image-match ${pct(beam["ITM match"], 0)} → ${pct(bal["ITM match"], 0)}: our default.`, options: { bullet: true, color: C.text, fontSize: 12, breakLine: true } },
      { text: `Detailed mode: ${pct(det["ITM match"], 0)} match with richer captions that short references under-reward.`, options: { bullet: true, color: C.text, fontSize: 12 } },
    ], { x: 7.3, y: 4.4, w: 5.25, h: 1.75, fontFace: BODY, margin: 0, valign: "middle", paraSpaceAfter: 4, isTextBox: true });
    s.addText(`${EVAL.images} images · 3 hand-written references each (${EVAL.images * 3} total) · BLEU / ROUGE-L / CIDEr-D implemented from scratch & unit-tested · ${EVAL.device.toUpperCase()}, 4 cores · *default mode`, { x: M, y: 6.4, w: W - 2 * M, h: 0.35, fontFace: BODY, fontSize: 10, italic: true, color: C.dim, margin: 0, isTextBox: true });
    footer(s, n);
    const r = (k, m) => R[k][m].toFixed(2);
    s.addNotes(`SPEAKER: Kushal Soni  (~75 s)

To measure quality objectively we wrote three human reference captions for each of our ${EVAL.images} test images, ${EVAL.images * 3} references in total. We compared five configurations with the standard captioning metrics: BLEU counts matching word sequences; ROUGE-L finds the longest common subsequence; CIDEr-D, the main COCO metric, weights informative words like "giraffe" higher than common words like "the". We implemented all three ourselves and unit-tested them.

Results (CIDEr-D): the base model with greedy decoding scores ${r("base-greedy", "CIDEr-D")}. Interestingly, the large model with greedy decoding is slightly lower at ${r("large-greedy", "CIDEr-D")}: a bigger model alone doesn't help if you decode naively. Beam search jumps to ${r("large-beam5", "CIDEr-D")}, a ${gain}% gain.

Adding our ITM re-ranking on top of beam search keeps CIDEr-D essentially the same (${r("beam-rerank", "CIDEr-D")}) but raises the image-match from ${pct(beam["ITM match"], 0)} to ${pct(bal["ITM match"], 0)}, so that's our default "Balanced" mode, at ${bal["sec / image"].toFixed(1)} seconds per image.

The Detailed mode reaches ${pct(det["ITM match"], 0)} image-match with longer, more specific captions, like "a bunch of red and white airplanes parked on an airport tarmac". Our short references don't contain those extra details, so n-gram metrics slightly penalise it. That's a known limitation of reference-based metrics.

Honesty note: 44 images is a small test set, so these numbers show trends rather than leaderboard scores, and the match score comes from the same model we re-rank with.`);
  }

  // 14 — Challenges ------------------------------------------------------------
  {
    const s = pres.addSlide(); n++;
    bg(s); kicker(s, "Engineering"); title(s, "Three bugs that taught us the most");
    const items = [
      ["LuBug", "Silent config error", "Matching model gave a correct caption a 2% match. The config used 8 attention heads instead of BLIP's 12: weights loaded fine, the maths was wrong.", "2% → 99.6% match", C.pink],
      ["LuGauge", "CPU thread contention", "In the browser a caption took >90 s instead of 5 s. PyTorch threads spin-wait; the browser's animations took one core and stalled all four.", ">90 s → ~8 s", C.cyan],
      ["LuTriangleAlert", "“arafed” artefacts", "BLIP-large sometimes invents words like “arafed” when decoding without context. We condition on its training prompt and clean the output.", "Clean captions", C.amber],
    ];
    const cw = 3.85;
    for (let i = 0; i < items.length; i++) {
      const [ic, h, d, res, col] = items[i];
      const x = M + i * (cw + 0.29), y = 1.95;
      card(s, x, y, cw, 4.75);
      await iconBadge(s, ic, x + 0.3, y + 0.3, 0.7, col);
      s.addText(h, { x: x + 0.3, y: y + 1.2, w: cw - 0.6, h: 0.45, fontFace: HEAD, fontSize: 18, bold: true, color: C.text, margin: 0, isTextBox: true });
      s.addText(d, { x: x + 0.3, y: y + 1.7, w: cw - 0.6, h: 1.9, fontFace: BODY, fontSize: 13, color: C.muted, margin: 0, valign: "top", isTextBox: true });
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x + 0.3, y: y + 3.8, w: cw - 0.6, h: 0.6, rectRadius: 0.3, fill: { color: col, transparency: 85 }, line: { color: col, width: 1 } });
      s.addText(res, { x: x + 0.3, y: y + 3.8, w: cw - 0.6, h: 0.6, fontFace: HEAD, fontSize: 15, bold: true, color: col, align: "center", valign: "middle", margin: 0, isTextBox: true });
    }
    footer(s, n);
    s.addNotes(`SPEAKER: Kushal Soni  (~70 s)

Three problems taught us the most.

One: when we first tested the matching model, it said a correct caption matched with only 2% probability. After debugging we found the configuration used 8 attention heads instead of BLIP's 12. The weight shapes are identical either way, so everything loaded without any error, but the maths was wrong. Fixing it brought the score to 99.6%, exactly the value in the official reference tests. Lesson: silent errors are the dangerous ones, so always validate against known outputs.

Two: in the browser, captioning sometimes took over 90 seconds instead of 5. PyTorch's threads spin-wait for each other, and when the browser's animations used one CPU core, all four threads stalled. Leaving one core free made it more than 10 times faster. We also pause decorative animations while the AI works.

Three: BLIP-large sometimes outputs nonsense words like "arafed". It learned them from noisy web alt-text. Conditioning on the prompt it was trained with ("a picture of"), plus a cleanup step, fixed it.`);
  }

  // 15 — Tech stack ------------------------------------------------------------
  {
    const s = pres.addSlide(); n++;
    bg(s); kicker(s, "Tech stack"); title(s, "What it's built with");
    const stack = [
      ["LuBrain", "PyTorch", "tensor maths & autograd"],
      ["LuPuzzle", "Hugging Face Transformers", "BLIP models & generation"],
      ["LuServer", "FastAPI + Uvicorn", "REST API + OpenAPI docs"],
      ["LuImage", "Pillow", "decoding, EXIF, palette"],
      ["LuCode", "HTML · CSS · JavaScript", "ES modules, Canvas, Web Speech"],
      ["LuTestTube", "pytest", "36 tests, models mocked"],
    ];
    for (let i = 0; i < stack.length; i++) {
      const [ic, h, d] = stack[i];
      const x = M + (i % 2) * 3.35, y = 1.95 + Math.floor(i / 2) * 1.5;
      card(s, x, y, 3.15, 1.3);
      await iconBadge(s, ic, x + 0.25, y + 0.32, 0.66, [C.violet, C.cyan, C.pink][Math.floor(i / 2)]);
      s.addText(h, { x: x + 1.08, y: y + 0.28, w: 1.95, h: 0.45, fontFace: HEAD, fontSize: 13, bold: true, color: C.text, margin: 0, valign: "middle", isTextBox: true });
      s.addText(d, { x: x + 1.08, y: y + 0.72, w: 1.95, h: 0.4, fontFace: BODY, fontSize: 11, color: C.muted, margin: 0, isTextBox: true });
    }
    card(s, 7.45, 1.95, 5.3, 4.3, C.card2);
    s.addText("By the numbers", { x: 7.75, y: 2.1, w: 4.7, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: C.text, margin: 0, isTextBox: true });
    const nums = [["4", "transformer models"], ["~1.25 B", "parameters in total"], ["8", "REST endpoints"], ["22", "features"], ["44", "sample images"], ["36", "automated tests"]];
    nums.forEach(([b, t], i) => {
      const x = 7.75 + (i % 2) * 2.5, y = 2.7 + Math.floor(i / 2) * 1.12;
      s.addText(b, { x, y, w: 2.3, h: 0.55, fontFace: HEAD, fontSize: 28, bold: true, color: [C.violet, C.cyan][i % 2], margin: 0, isTextBox: true });
      s.addText(t, { x, y: y + 0.52, w: 2.3, h: 0.35, fontFace: BODY, fontSize: 12, color: C.muted, margin: 0, isTextBox: true });
    });
    footer(s, n);
    s.addNotes(`SPEAKER: Kushal Soni  (~40 s)

Our stack: Python, PyTorch and Hugging Face Transformers for the AI; FastAPI and Uvicorn for the server; Pillow for image processing; plain HTML, CSS and JavaScript for the interface, using the Canvas API for heatmaps and the Web Speech API for text-to-speech; and pytest for 36 automated tests. The neural networks are mocked in the tests, so the whole suite runs in about five seconds.

In total: four transformer models with about 1.25 billion parameters, eight REST endpoints and 22 features.`);
  }

  // 16 — Future scope ----------------------------------------------------------
  {
    const s = pres.addSlide(); n++;
    bg(s); kicker(s, "What's next"); title(s, "Future scope");
    const fut = [
      ["LuLanguages", "Indian languages", "Hindi, Gujarati, Marathi captions via a translation model"],
      ["LuBrain", "Bigger vision-language models", "BLIP-2 / Florence-2 for paragraph-length descriptions on GPU"],
      ["LuVideo", "Video captioning", "Describe clips scene by scene"],
      ["LuTarget", "Fine-tuning", "Adapt to Indian scenes and domain data (medical, retail)"],
      ["LuSmartphone", "On-device", "Quantised ONNX model inside a mobile app"],
      ["LuShieldCheck", "Bias & safety audit", "Measure and reduce demographic bias in captions"],
    ];
    for (let i = 0; i < fut.length; i++) {
      const [ic, h, d] = fut[i];
      const x = M + (i % 2) * 6.15, y = 1.95 + Math.floor(i / 2) * 1.55;
      await iconBadge(s, ic, x, y + 0.1, 0.7, [C.violet, C.cyan][i % 2]);
      s.addText(h, { x: x + 0.95, y: y + 0.05, w: 5.0, h: 0.4, fontFace: HEAD, fontSize: 17, bold: true, color: C.text, margin: 0, isTextBox: true });
      s.addText(d, { x: x + 0.95, y: y + 0.47, w: 5.0, h: 0.5, fontFace: BODY, fontSize: 13, color: C.muted, margin: 0, valign: "top", isTextBox: true });
    }
    footer(s, n);
    s.addNotes(`SPEAKER: Kushal Soni  (~40 s)

Where next?
- Captions in Indian languages like Hindi, Gujarati and Marathi through a translation model.
- Larger vision-language models such as BLIP-2 or Florence-2 for paragraph-length descriptions when a GPU is available.
- Video captioning, scene by scene.
- Fine-tuning on Indian scenes and domain data, because most training data is Western.
- A quantised model running on-device in a mobile app.
- And a bias and safety audit of the captions.

HANDOVER: "Kartik will conclude."`);
  }

  // 17 — Thank you -------------------------------------------------------------
  {
    const s = pres.addSlide(); n++;
    bg(s, "title");
    s.addText("Thank you", { x: M, y: 1.3, w: 7, h: 1.2, fontFace: HEAD, fontSize: 64, bold: true, color: C.text, margin: 0, isTextBox: true });
    s.addText("Questions?", { x: M, y: 2.5, w: 7, h: 0.7, fontFace: HEAD, fontSize: 30, bold: true, color: C.violet, margin: 0, isTextBox: true });
    const sum = ["Accurate captions, verified by a second model", "Word-level explanations with Grad-CAM", "Visual Q&A and description matching", "Runs offline on a laptop CPU"];
    s.addText(sum.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < sum.length - 1 } })),
      { x: M, y: 3.5, w: 6.3, h: 1.9, fontFace: BODY, fontSize: 16, color: C.muted, paraSpaceAfter: 8, valign: "top", margin: 0, isTextBox: true });
    ["Kartik Verma", "Dhir Thakar", "Kushal Soni"].forEach((nm, i) => {
      const x = M + i * 2.1;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 5.75, w: 1.95, h: 0.55, rectRadius: 0.27, fill: { color: C.card2 }, line: { color: [C.violet, C.cyan, C.pink][i], width: 1.25 } });
      s.addText(nm, { x, y: 5.75, w: 1.95, h: 0.55, fontFace: BODY, fontSize: 14, bold: true, color: C.text, align: "center", valign: "middle", margin: 0, isTextBox: true });
    });
    await framedImage(s, IMG("result_panel.jpg"), 7.6, 0.9, 5.1, 5.7);
    s.addNotes(`SPEAKER: Kartik Verma, then all three for questions

To conclude: PixelProse generates accurate captions, verifies them with a second model, explains them word by word, answers questions, and runs entirely on a laptop.

Thank you for your attention. We're happy to take questions.

Q&A prep: see docs/PRESENTATION_GUIDE.md section 5 (did you train it, CNN-LSTM vs transformers, attention, confidence, BLEU/CIDEr, why not GPT-4V, Grad-CAM, decoding strategies, limitations, speed, memory).`);
  }

  const out = path.join(__dirname, "PixelProse_Presentation.pptx");
  await pres.writeFile({ fileName: out });
  await checkGeometry(out);
  console.log("wrote", out, `(${n} slides)`);
}

/** PowerPoint silently drops shapes with negative offsets/sizes or NaN values, so fail loudly instead. */
async function checkGeometry(file) {
  const JSZip = require("jszip");
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const problems = [];
  for (const name of Object.keys(zip.files).filter((f) => /^ppt\/(slides|charts)\/[^/]+\.xml$/.test(f))) {
    const xml = await zip.file(name).async("string");
    if (/NaN|undefined|Infinity/.test(xml)) problems.push(`${name}: NaN/undefined value`);
    for (const m of xml.matchAll(/<a:(off|ext) [^>]*?(x|y|cx|cy)="(-\d+)"/g)) problems.push(`${name}: negative ${m[2]}=${m[3]}`);
  }
  if (problems.length) throw new Error("Invalid geometry:\n" + problems.join("\n"));
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
