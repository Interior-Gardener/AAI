# PixelProse — Presentation Guide

A complete playbook for presenting **PixelProse: Explainable AI Image Caption Generator**. It covers who says what, a word-for-word script for every slide, the live-demo run-sheet, a backup plan, and viva questions with answers.

**Deck:** `presentation/PixelProse_Presentation.pptx`. The script below is also in each slide's **speaker notes**, so you can read it in PowerPoint's Presenter View.

---

## 1. Format at a glance

| Part | Slides | Speaker | Time |
|---|---|---|---|
| Opening, problem, goals, product, architecture | 1–5 | **Kartik Verma** | 4 min |
| How BLIP works, our caption pipeline | 6–7 | **Kushal Soni** | 3 min |
| Explainability, Ask & Match, features, design | 8–11 | **Dhir Thakar** | 4 min |
| **Live demo** | 12 | **Dhir Thakar** (Kartik on keyboard) | 5 min |
| Evaluation, challenges, tech stack, future scope | 13–16 | **Kushal Soni** | 4 min |
| Conclusion & Q&A | 17 | **All** (Kartik moderates) | 5 min + |

Total: about **20 minutes + questions**. For a 10-minute slot, skip slides 10, 11 and 15 and shorten the demo to steps 1–4.

**Roles are suggestions.** Swap them to suit each person's strengths. Just keep one person on the keyboard during the demo while another speaks.

---

## 2. Before the day (checklist)

- [ ] Run `setup.bat` (Windows) or `./setup.sh` (macOS/Linux) on the **presentation laptop** at home. This downloads about 4 GB of models once.
- [ ] Start the app (`start.bat` / `./start.sh`) and wait for the green **Ready · CPU** pill. Caption one sample to warm the models up.
- [ ] Practise the demo at least **3 times** with a stopwatch.
- [ ] Charge the laptop and **plug it in** during the talk (inference is faster on AC power).
- [ ] Set the display to **dark theme** (looks best on projectors), browser zoom 100–110%, full screen (**F11**).
- [ ] Close other heavy apps (games, IDE indexing, dozens of browser tabs): the AI runs on the CPU.
- [ ] Open two browser tabs in advance: the app (`http://127.0.0.1:8000`) and the API docs (`/docs`).
- [ ] Put 2–3 **fresh photos** on the desktop (a photo of your classroom, your faculty's campus, a friend holding something). A live, never-seen-before image is the most convincing moment of any AI demo.
- [ ] Copy `docs/images/` screenshots to a USB stick as a **backup** in case the laptop fails.
- [ ] No internet is needed once the models are downloaded. Mention that proudly!

---

## 3. Slide-by-slide script

> Speak to the audience, not the screen. Every script is about 45–70 seconds when spoken naturally.

### Slide 1: Title (Kartik)
“Good morning everyone. We are Kartik Verma, Dhir Thakar and Kushal Soni, and our Advanced AI project is **PixelProse**, an explainable image caption generator. In one line: you give it any photo, and it writes a human-like sentence describing it. More importantly, it can **show you where it looked** for every word, and it can **answer questions** about the image. Everything you'll see today runs locally on this laptop's CPU, with no cloud API.”

### Slide 2: The problem (Kartik)
“Why does this matter? According to the WHO, at least **2.2 billion people** live with a vision impairment. They rely on screen readers, and screen readers rely on *alt-text*, a written description of every image. Yet more than half of the web's most popular home pages have images with **no alt-text at all**. Beyond accessibility, automatic captions power image search, content moderation, photo organisation and robots that need to describe what they see. Describing an image sounds trivial for a human, but for a computer it combines two hard problems: **computer vision** to understand the scene, and **natural language generation** to express it fluently.”

### Slide 3: Objectives (Kartik)
“We set ourselves six goals. One: captions that are genuinely accurate, not just plausible. Two: **explainability**, because the AI shouldn't be a black box. Three: interactivity, so you can ask follow-up questions. Four: a clean, modern interface that anyone can use. Five: it must run on an ordinary student laptop without a GPU. And six: we wanted to *measure* quality with the standard research metrics instead of just claiming it's good.”

### Slide 4: Meet PixelProse (Kartik)
“This is PixelProse. On the left you pick an image: upload, drag and drop, paste, a URL, your webcam, or one of 44 built-in samples. On the right you get the caption, with a **confidence** score and an independent **image-match** score. Then there are four tabs. *Candidates* shows every sentence the model considered. *Explain* shows attention heatmaps. *Ask* is a chat for questions. *Match* lets you test your own descriptions. Dhir will show all of this live in a few minutes.”

### Slide 5: System architecture (Kartik)
“Under the hood there are three layers. The **frontend** is plain HTML, CSS and JavaScript modules, so there is no build step and it's easy to run anywhere. It talks over a REST API to a **FastAPI** server in Python. The server has independent services: the Captioner, the Matcher, the question answerer and image utilities. A **Model Manager** loads four transformer networks lazily, picks the best device (GPU, Apple Silicon or CPU) and makes sure requests don't fight over the processor. Caches mean an image is uploaded once and repeat requests are instant. Now Kushal will explain the AI itself.”

### Slide 6: Inside BLIP (Kushal)
“Our core model is **BLIP**, *Bootstrapping Language-Image Pre-training*, published by Salesforce Research at ICML 2022. It has two halves. First, a **Vision Transformer**: the image is resized to 384 by 384 and cut into 576 small patches of 16 by 16 pixels. Each patch becomes a vector, and 24 layers of self-attention let every patch look at every other patch. The output is 577 vectors of 1024 numbers each, a numeric ‘understanding’ of the image. Second, a **text decoder** similar to BERT writes the caption one word at a time. At every word it uses **cross-attention** to look back at the image patches. BLIP was pre-trained on 129 million image-text pairs. Its key trick, *CapFilt*, uses a captioner to write synthetic captions and a filter to throw away noisy web captions. The large model has 446 million parameters.”

### Slide 7: Our caption pipeline (Kushal)
“We didn't just call the model once. We built a pipeline around it. Step one: encode the image **only once**. Step two: generate several candidate sentences. **Beam search** keeps the 5 most probable sentences at every step, which is accurate. In *Detailed* mode we add **nucleus sampling**, which picks from the top 90% of probability mass and is more varied. Step three: clean and de-duplicate them. Step four: score every word's probability in a single batched pass. That gives us a confidence value, which is the inverse of perplexity. Step five: a second network, the **Image-Text Matching** model, re-reads each sentence together with the image and says how well they match. The final score is 65% match plus 35% confidence, so the winner is both fluent *and* grounded in the picture. It's like having the model write several drafts and then asking a fact-checker to pick the best one.”

### Slide 8: Explainable AI (Dhir)
“A common criticism of deep learning is that it's a black box. PixelProse opens the box. For every word in the caption we compute a heatmap with **Grad-CAM**. We take the cross-attention between the word and the 576 image patches, and weight it by the gradient of the match score, which tells us how much that attention actually mattered. Hover over ‘dog’ and the dog lights up. Hover over ‘woman’ and the heat moves to her. Below that, a bar chart shows how confident the model was about each individual word. Orange bars mark words where it hesitated.”

### Slide 9: Ask & Match (Dhir)
“The *Ask* tab uses a third network, **BLIP-VQA**, for Visual Question Answering. It encodes your question *together with* the image and generates a short answer: ‘What is the woman wearing?’, ‘plaid shirt’. The *Match* tab turns the matching model into a playground. Type any descriptions and it scores each one. A correct description scores near 100%, a wrong one near 0. It's a great way to probe what the model really understands.”

### Slide 10: Feature showcase (Dhir)
“Beyond the core AI we added a lot of practical features: guided captions like ‘a painting of…’, a fast/accurate model switch, keywords and hashtags, the image's colour palette, accessible alt-text HTML ready to paste into a website, text-to-speech, a downloadable caption card for social media, batch mode for up to 12 images with CSV export, a history drawer, a REST API with interactive documentation, and a command-line tool.”

### Slide 11: Design & experience (Dhir)
“We treated the interface as seriously as the model. It's a glassmorphism design with dark and light themes. It's fully responsive, so it works on a phone. Every wait is visualised: while the AI works, a scanning beam sweeps the image over a 24 by 24 grid, which is exactly how the Vision Transformer sees it, and a live checklist shows each pipeline stage. We also respected accessibility: keyboard shortcuts, focus states, screen-reader labels and reduced-motion support. Now let's see it live.”

### Slide 12: Live demo (Dhir presents, Kartik drives)
Follow the **demo run-sheet** in section 4 below.

### Slide 13: Evaluation (Kushal)
“To measure quality objectively we wrote three human reference captions for each of our 44 test images, 132 references in total. Then we compared five configurations using the standard captioning metrics: **BLEU**, which counts matching word sequences; **ROUGE-L**, which finds the longest common subsequence; and **CIDEr-D**, the main metric of the COCO benchmark, which weights informative words higher. We implemented all three ourselves and unit-tested them. First surprise: the large model with naive greedy decoding scored *lower* than the small model, 1.76 vs 1.82. Beam search fixed that, at 1.96, an 8% gain. Adding our re-ranking keeps that score at 1.95 but raises the image-match from 88% to 92%, so that's our default *Balanced* mode, at about 4 seconds per image. The *Detailed* mode reaches 97% match with richer captions, but short reference captions under-reward those extra details, and sampling occasionally invents words. We chose the default based on this data, not on guesswork.”

### Slide 14: Engineering challenges (Kushal)
“Three problems taught us the most. **One:** when we first tested the matching model it said a correct caption matched with only 2% probability. After debugging, we found the configuration used 8 attention heads instead of BLIP's 12. The weights loaded without any error, but the maths was wrong. Fixing it brought the score to 99.6%. Lesson: *silent* errors are the dangerous ones, so always validate against known outputs. **Two:** in the browser, captioning sometimes took over 90 seconds instead of 5. PyTorch's threads spin-wait, and when the browser's animations used one core, all four threads stalled. Leaving one core free made it more than 10 times faster. **Three:** BLIP-large sometimes outputs nonsense words like ‘arafed’. Conditioning on the prompt it was trained with, plus a cleanup step, fixed it.”

### Slide 15: Tech stack (Kushal)
“Our stack: Python, PyTorch and Hugging Face Transformers for the AI; FastAPI and Uvicorn for the server; Pillow for images; vanilla HTML, CSS and JavaScript for the interface; and pytest with 35 automated tests. The neural networks are mocked in the tests, so they run in about 5 seconds.”

### Slide 16: Future scope (Kushal)
“Where next? Captions in Indian languages like Hindi and Gujarati through a translation model. Larger vision-language models such as BLIP-2 or Florence-2 for paragraph-length descriptions when a GPU is available. Video captioning. Fine-tuning on Indian scenes, because most training data is Western. And model quantisation, so it runs on phones.”

### Slide 17: Conclusion & Q&A (Kartik)
“To conclude: PixelProse generates accurate captions, **verifies** them with a second model, **explains** them word by word, **answers questions**, and runs entirely on a laptop. Thank you for your attention. We're happy to take questions.”

---

## 4. Live-demo run-sheet (≈ 5 minutes)

**Setup:** app already open in dark theme, full screen, scrolled to the top, models ready (green pill).

| # | Action (Kartik) | Say (Dhir) |
|---|---|---|
| 1 | Show the hero for 3 s, then click **Start captioning** | “This is the home page. The demo card up here is looping real outputs from our model.” |
| 2 | **Samples → people → woman and dog on beach**, press **Generate** | “Watch the scanning grid. That's the 24×24 patch grid the Vision Transformer sees.” |
| 3 | Result appears. Point at the rings | “‘A woman sitting on a beach next to a dog’, with a 99% image match.” |
| 4 | **Candidates** tab, then click the 2nd candidate | “These are all the drafts. Click one and it becomes the caption.” |
| 5 | **Explain** tab: hover *dog*, then *woman*, then *beach*, then press **Play** | “Here's where it looked for each word…” (pause and let the audience watch) |
| 6 | **Ask** tab: type *what is the woman wearing?*, then click *How many people are there?* | “We can simply ask questions.” |
| 7 | **Match** tab: type *a cat sleeping on a sofa* and *a woman playing with her dog* | “A wrong description scores near zero, the right one near 100%.” |
| 8 | **Upload** tab: drag in a **fresh photo** from the desktop and Generate | “This image has never been seen before. It was taken this morning.” |
| 9 | Open **Settings**, pick prefix *a painting of*, choose **Base** model, Generate | “Guided captioning, and the fast model.” |
| 10 | Click **Speak**, then **Card** | “It can read the caption aloud, and export a shareable card.” |
| 11 | *(optional)* Toggle theme with **T**; open history with **H** | “Dark and light themes, and a history of everything.” |
| 12 | *(optional)* Switch to the `/docs` tab | “And for developers, a full REST API with live documentation.” |

**If something goes wrong**
- *Model still loading:* talk through slide 7 again for 30 seconds, then retry.
- *Generation seems slow:* switch to the **Base** model in Settings (about 2× faster).
- *Laptop or app failure:* switch to the slides. Slides 4, 8 and 9 contain real screenshots of every feature. Keep calm and narrate them as if live.
- *A wrong caption on a live photo:* treat it as a teaching moment. Open **Explain** to show *why* it got confused, and **Match** to show the correct description scoring higher. Examiners love this.

---

## 5. Viva / Q&A preparation

**Q: Did you train the model yourselves?**
A: No. Training BLIP from scratch needs 129M image-text pairs and many GPU-days. We use the officially released pre-trained and COCO-fine-tuned weights (transfer learning) and built our contribution *around* the model: multi-strategy decoding, ITM re-ranking, confidence scoring, Grad-CAM explainability, VQA integration, the evaluation benchmark, the engineering and the interface. Fine-tuning on a custom dataset is in our future scope.

**Q: What is the difference between CNN-LSTM captioning and your approach?**
A: Classic models (e.g. *Show and Tell*, 2015) use a CNN such as ResNet to get one image vector and an LSTM to generate words. BLIP uses transformers on both sides: a ViT gives 576 patch vectors instead of one, and the decoder uses cross-attention to focus on different patches for each word. That's more accurate, parallelisable and interpretable.

**Q: What is attention / cross-attention?**
A: Attention computes a weighted average of values, with weights `softmax(QKᵀ/√d)`. In *self*-attention the queries, keys and values come from the same sequence. In *cross*-attention the queries come from the text and the keys/values from the image, so each word “looks at” image regions.

**Q: How is the confidence computed? Why is it only ~55%?**
A: It is the geometric mean of the probabilities of the generated tokens, `exp(mean log p)`. Language is ambiguous: “on *a* beach” and “on *the* beach” are both correct, so probability is split between valid words. 55% per token is actually high. The **image match** score (often above 95%) is the better measure of whether the caption is *correct*.

**Q: What are BLEU and CIDEr?**
A: BLEU measures n-gram precision against reference captions, with a penalty for too-short outputs. CIDEr gives each n-gram a TF-IDF weight, so rare, informative words (“giraffe”) count more than common ones (“a”, “the”), and compares with cosine similarity. It correlates best with human judgement and is the main COCO metric.

**Q: Why not use ChatGPT/GPT-4V or Gemini?**
A: They are cloud services: they cost money per request, need internet, send user photos to a third party, and are black boxes that we can't explain or evaluate internally. PixelProse runs offline and privately, and exposes its internals (attention, probabilities).

**Q: What is Grad-CAM?**
A: Gradient-weighted Class Activation Mapping (Selvaraju et al., 2017). It multiplies an activation or attention map by the gradient of the output score with respect to that map, keeping only the positive influence. We apply it to cross-attention in the matching model.

**Q: Beam search vs greedy vs sampling?**
A: Greedy picks the single most likely word each step, which is fast but short-sighted. Beam search keeps *k* partial sentences and finds more probable complete sentences. Sampling draws words randomly from the distribution (top-p limits it to the most likely ones) for variety. We combine beam search and sampling, then re-rank.

**Q: What are the limitations?**
A: English only. It sometimes misses fine details or counts objects wrongly, it can inherit biases from web training data, and the ~4 GB of models plus a 3–8 s CPU latency rule out very low-end devices. The re-ranker reduces but doesn't eliminate hallucinations.

**Q: How long does a caption take?**
A: Measured on a 4-core CPU: about 4 s for the default Balanced mode with the large model, 5–6 s for Detailed, and about 1 s for the base model with greedy decoding. A GPU brings it well under a second.

**Q: How much memory does it need?**
A: About 5 GB of RAM with all four models loaded in float32. Setting `ENABLE_VQA=false` or using the base model reduces this.

**Q: How does the app handle many users?**
A: FastAPI serves requests in a thread pool, and locks make sure models are not run in parallel on the CPU (which would slow everyone down). Results and images are cached, and the design would scale out behind a GPU inference server.

**Q: What was your individual contribution?**
A: Each member should prepare a 30-second honest answer about the parts they worked on and understood best.

---

## 6. Presentation tips

1. **Lead with the demo effect.** Mention in the first minute that there will be a live demo. It keeps attention.
2. **Pause on the heatmap.** Stay silent for 2–3 seconds while “dog” lights up. Visuals speak louder than words.
3. **Use the audience.** Ask a faculty member for an object or a description to test in *Match*. Interaction is memorable.
4. **Numbers beat adjectives.** Say “99.7% match, 446 million parameters, 35 tests”, not “very accurate, very big”.
5. **Hand-offs:** end your part with a clear handover (“Now Kushal will explain the model”).
6. **Dress the screen:** dark theme, full screen, hide the bookmarks bar, zoom to 110% on large projectors.
7. **Own the mistakes.** If the AI gets something wrong, explain why with the Explain tab. That shows real understanding.
