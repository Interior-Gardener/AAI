# PixelProse — Feature Guide

Every feature in the project: **what it does**, **how it works**, **where the code lives**, and **how to show it off** in a demo.

| # | Feature | Area |
|---|---------|------|
| 1 | [Image caption generation](#1-image-caption-generation) | Core AI |
| 2 | [Five ways to input an image](#2-five-ways-to-input-an-image) | Input |
| 3 | [Multi-candidate decoding (beam + sampling)](#3-multi-candidate-decoding) | Core AI |
| 4 | [Self-verification & re-ranking (ITM)](#4-self-verification--re-ranking) | Core AI |
| 5 | [Confidence scores & word-level probabilities](#5-confidence-scores--word-level-probabilities) | Explainability |
| 6 | [Attention heatmaps (Grad-CAM)](#6-attention-heatmaps-grad-cam) | Explainability |
| 7 | [Visual Question Answering chat](#7-visual-question-answering-chat) | AI |
| 8 | [Match — score your own descriptions](#8-match--score-your-own-descriptions) | AI |
| 9 | [Guided (conditional) captioning](#9-guided-conditional-captioning) | AI |
| 10 | [Model switch: Large vs Base](#10-model-switch-large-vs-base) | AI |
| 11 | [Insights: keywords, hashtags, palette, metadata, timing, alt-text](#11-insights-panel) | Extras |
| 12 | [Text-to-speech](#12-text-to-speech) | Accessibility |
| 13 | [Shareable caption card](#13-shareable-caption-card) | Extras |
| 14 | [Batch mode with CSV/JSON export](#14-batch-mode) | Productivity |
| 15 | [History drawer](#15-history) | Productivity |
| 16 | [Themes, animations & keyboard shortcuts](#16-interface--experience) | UI/UX |
| 17 | [REST API with interactive docs](#17-rest-api) | Engineering |
| 18 | [Command-line tool](#18-command-line-tool) | Engineering |
| 19 | [Evaluation benchmark (BLEU / ROUGE-L / CIDEr-D)](#19-evaluation-benchmark) | Research |
| 20 | [Performance engineering](#20-performance-engineering) | Engineering |
| 21 | [Offline model conversion](#21-offline-model-conversion) | Engineering |
| 22 | [Safety & robustness](#22-safety--robustness) | Engineering |

---

## 1. Image caption generation

**What:** Upload a photo, get a fluent English sentence describing it, e.g. *“A woman sitting on a beach next to a dog.”*

**How:** We use **BLIP-large** (Salesforce, ICML 2022): a Vision Transformer (ViT-L/16) encodes the image into 577 feature vectors (one per 16×16 patch plus a global token); a 12-layer BERT-style decoder then writes the sentence one token at a time, using **cross-attention** to look at the image features at every step. The decoder is conditioned on the prefix *“a picture of”* (the prompt BLIP was fine-tuned with) which is removed afterwards. That avoids BLIP-large's well-known junk outputs such as *“arafed man…”*, and a cleaning step catches any that slip through.

**Code:** `app/services/captioner.py` (`Captioner.caption`), cleanup in `app/services/text_utils.py`.

**Demo tip:** Use *Samples → people → woman and dog on beach*: the caption is accurate and the heatmaps come out clean.

## 2. Five ways to input an image

| Method | How |
|---|---|
| Upload | Click the drop zone or drag & drop a file anywhere on the input panel |
| Paste | Copy any image (e.g. a screenshot) and press **Ctrl + V** anywhere on the page |
| URL | Paste a link. The **server** downloads it, so browser CORS rules don't get in the way |
| Camera | Live webcam preview with a shutter button and front/back camera flip |
| Samples | 44 bundled test images in 6 categories with filter chips |

**Code:** `static/js/studio.js` (`initSources`), `static/js/camera.js`, `/api/samples` in `app/main.py`.

## 3. Multi-candidate decoding

**What:** Instead of a single sentence, the model writes several candidates and the best one wins. The **Candidates** tab lists all of them with their scores.

**How:** The image is encoded **once**, and every decoding strategy reuses that encoding. The *Caption style* setting picks one of three:
- **Balanced (default, `beam`)**: **beam search** (width 1–10) keeps the *k* most probable partial sentences at every step and returns the top 5, which gives accurate, reproducible captions.
- **Detailed (`hybrid`)**: beam search plus **nucleus (top-p) sampling** (p = 0.9) drafts, which gives richer, more specific captions.
- **Creative (`sampling`)**: sampling only, with an adjustable temperature, for varied wording.

A repetition penalty (1.1) and `no_repeat_ngram_size=3` stop loops like “a dog and a dog”. The choice of default is backed by the benchmark in [EVALUATION.md](EVALUATION.md).

Duplicates are removed, then every candidate is scored (next two features).

**Code:** `Captioner._decode`, `Captioner._score`.

## 4. Self-verification & re-ranking

**What:** A second neural network, **BLIP-ITM** (image-text matching), acts as a fact-checker. It reads each candidate sentence *together with the image* and outputs the probability that they match.

**How:** Final score = **0.65 × ITM match + 0.35 × language confidence**. This favours captions that are both fluent *and* grounded in the picture, which helps suppress hallucinated objects. The **Image match** ring in the results shows this probability for the chosen caption.

**Code:** `app/services/matcher.py` (`Matcher.score`), blending in `Captioner.caption`.

## 5. Confidence scores & word-level probabilities

**What:** A **Confidence** ring (how sure the language model is) plus a **bar chart of every word's probability** in the Explain tab. Words below 25% turn orange: those are where the model hesitated.

**How:** After decoding we run one **teacher-forced forward pass** over all candidates in a single batch and read the log-probability of every token. Confidence is the geometric mean of the token probabilities, `exp(mean log p)`, which is the inverse of perplexity. Word pieces (e.g. `sky` + `##scraper`) are merged, and a word's probability is the product of its pieces.

**Code:** `Captioner._score`, `_merge_wordpieces`.

## 6. Attention heatmaps (Grad-CAM)

**What:** In the **Explain** tab, hover over any word to see a heatmap over the image showing *where the model looked* for that word. **Play** animates through the caption word by word, and **Whole caption** shows the combined map.

**How:** We take the ITM model's cross-attention map at layer 8 (the layer the BLIP authors use for grounding), compute the **gradient of the match score** with respect to it, and keep the positive part. `Grad-CAM = mean over heads( attention × ReLU(gradient) )` gives a 24×24 grid per token. The browser colours it with a turbo colour map, upscales it smoothly and blends it over the photo at the opacity you choose.

**Code:** `Matcher.ground` (server) and `static/js/explain.js` (rendering).

**Demo tip:** On *woman and dog on beach*, hover “dog” and then “woman”, and the heat moves between them. This is the most impressive moment of the demo.

## 7. Visual Question Answering chat

**What:** The **Ask** tab is a chat where you can ask questions like *“What is the woman wearing?”* and get *“plaid shirt”*, with a confidence value. Suggested-question chips give one-click questions.

**How:** **BLIP-VQA** encodes the question *jointly* with the image (the text encoder cross-attends to image patches), then an answer decoder generates a short answer with beam search (3 beams).

**Code:** `app/services/vqa.py`, `static/js/chat.js`.

## 8. Match — score your own descriptions

**What:** Type any descriptions, one per line, and see how well each one fits the image, with verdicts (*fits well / partly fits / doesn't fit*). The AI's own caption is included for comparison.

**How:** Two scores from BLIP-ITM: the **ITM probability** (deep, cross-attention-based) and the **ITC cosine similarity** between the image and text embeddings (fast, CLIP-style).

**Demo tip:** Ask the audience for a wrong description (“a cat on a sofa”) and show it scoring near 0%.

## 9. Guided (conditional) captioning

**What:** A *Guided prefix* such as “a painting of” or “a black and white photo of” makes the caption start with that text, which steers the style.

**How:** The prefix is tokenised and fed to the decoder as the start of the sentence. Decoding continues from there, so it becomes part of the caption.

## 10. Model switch: Large vs Base

**What:** A *Large · accurate* / *Base · fast* toggle. BLIP-base (ViT-B/16, 224M parameters) is about 2× faster on CPU than BLIP-large (ViT-L/16, 446M) with the same decoding. See the latency numbers in [EVALUATION.md](EVALUATION.md).

## 11. Insights panel

- **Keywords & hashtags** are content words from the caption (stop-words removed). Click to copy the hashtags.
- **Colour palette** holds the 6 dominant colours (median-cut quantisation), sized by share. Click to copy the hex code.
- **Image details** covers resolution, megapixels, aspect ratio, format, file size and brightness tone.
- **Pipeline timing** shows how many milliseconds each stage took (vision, decode, scoring, re-rank).
- **Accessible alt-text** is a ready-to-paste `<img alt="…">` snippet for web accessibility.

**Code:** `app/services/image_utils.py`, `app/services/text_utils.py`.

## 12. Text-to-speech

The **Speak** button (or the **S** key) reads the caption aloud with the browser's Web Speech API. The *Read caption aloud* setting speaks every new caption automatically, which helps visually-impaired users.

## 13. Shareable caption card

**Card** downloads a 1080×1350 PNG (Instagram portrait size) with the photo, the caption and the confidence and match scores, rendered on a `<canvas>` in the browser.

## 14. Batch mode

Drop up to 12 images and they are captioned one after another, each with a scanning animation and a progress bar. Export the results as **CSV** or **JSON**. Useful for building datasets or checking a website's alt-text.

## 15. History

The last 30 results (thumbnail + full result) are saved in the browser's `localStorage`. Open the drawer with the clock icon or **H**, click an entry to restore it (the image is re-registered with the server so Ask and Explain keep working), remove single entries, export or clear everything.

## 16. Interface & experience

- Glassmorphism design, animated aurora background, and a particle network in the hero that reacts to the mouse
- Hero demo card that loops through **real** model outputs with a scan-and-detect animation and typewriter text
- Scanning laser and 24×24 patch-grid overlay on your image while the AI works (the grid matches the ViT's patches)
- Animated neural-network loader with a live pipeline checklist
- Captions revealed word by word, count-up confidence rings, a sparkle burst, sliding tab indicators and button ripples
- **Dark / light theme** (remembers your choice, follows the OS by default)
- Fully responsive down to phone width, `prefers-reduced-motion` respected, keyboard focus styles, ARIA labels
- Keyboard shortcuts: **Ctrl+Enter** generate · **R** again · **C** copy · **S** speak · **H** history · **T** theme · **?** help · **Esc** close

**Code:** `static/css/styles.css`, `static/js/effects.js`, `static/js/ui.js`.

## 17. REST API

FastAPI auto-generates interactive documentation at **http://127.0.0.1:8000/docs** (Swagger UI), where every endpoint can be tried in the browser. See [API.md](API.md).

## 18. Command-line tool

```bash
python cli.py sample_images/food --csv captions.csv
python cli.py photo.jpg --ask "what color is the car?" --prompt "a photo of"
```

It uses the same services as the web app, with no server needed.

## 19. Evaluation benchmark

`scripts/evaluate.py` compares five configurations, from a naive greedy baseline up to both PixelProse modes, on the 44 sample images against 132 hand-written reference captions. It reports **BLEU-1…4, ROUGE-L, CIDEr-D** (all implemented from scratch in `app/services/metrics.py` and unit-tested), the ITM match and latency. Results are in [EVALUATION.md](EVALUATION.md).

## 20. Performance engineering

- **Encode once, decode many:** the ViT runs once per image, no matter how many candidates are generated
- **Batched scoring:** all candidates are scored in one forward pass
- **Lazy loading + background preload:** the page is usable immediately while models load, and the navbar pill shows their status
- **LRU caches:** uploaded images (so follow-up questions send a 40-char id, not the image again) and deterministic caption results (a repeat request returns instantly)
- **CPU-aware threading:** PyTorch uses all cores but one, and on CPU one model runs at a time. We measured a >10× slowdown when PyTorch competed with the browser for every core.
- **FP16 on GPU**, automatic CUDA / Apple-MPS / CPU selection
- **GZip** for JSON responses; the frontend skips animation frames when elements are off-screen and pauses decorative animations during inference

## 21. Offline model conversion

`scripts/convert_original_blip.py` downloads Salesforce's **original research checkpoints** from Google Cloud Storage and converts them to the Hugging Face format. It is a lifeline when a college network blocks huggingface.co. It documents a subtle pitfall we found: `BlipTextConfig` defaults to 8 attention heads while BLIP uses 12. The weights still load, but predictions quietly degrade (the ITM score fell from 0.996 to 0.02).

## 22. Safety & robustness

- Uploads are validated (type, 15 MB limit, decompression-bomb guard, EXIF rotation, transparency flattened)
- URL fetching allows only `http/https`, blocks private/loopback addresses (SSRF protection) and re-checks after redirects
- Every request body is validated by Pydantic; errors come back as readable messages shown as toasts
- 36 automated tests (`pytest`) cover the API, image handling, text processing and metrics, with the neural networks mocked so they run in seconds
