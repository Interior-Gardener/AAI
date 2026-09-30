const { H1, H2, H3, P, BUL, FIG, TAB } = require("../lib");
const R = require("../../reports/evaluation.json");

const f3 = (v) => v.toFixed(3);
const pc = (v) => (v * 100).toFixed(1) + " %";
const r = R.results;
const names = {
  "base-greedy": "BLIP-base, greedy",
  "large-greedy": "BLIP-large, greedy",
  "large-beam5": "BLIP-large, beam search (k = 5)",
  "beam-rerank": "PixelProse Balanced (5 beams + ITM re-rank)",
  full: "PixelProse Detailed (beam + sampling + re-rank)",
};
const order = ["base-greedy", "large-greedy", "large-beam5", "beam-rerank", "full"];
const gain = ((r["large-beam5"]["CIDEr-D"] / r["base-greedy"]["CIDEr-D"] - 1) * 100).toFixed(1);

module.exports = [
  H1(7, "RESULT ANALYSIS"),

  H2("7.1", "Introduction"),
  P("This chapter evaluates PixelProse quantitatively and qualitatively. We describe the experimental setup, report caption quality with BLEU, ROUGE-L and CIDEr-D for five pipeline configurations, analyse latency, present qualitative captions, question-answering and explainability results, summarise the engineering findings made during testing, and compare the system with published models and existing captioning tools."),

  H2("7.2", "Experimental Setup"),
  TAB("setup",
    ["Parameter", "Value"],
    [
      ["Test set", `${R.images} images in 6 categories (animals 14, people 9, nature 8, vehicles 6, food 5, art 2)`],
      ["References", `3 hand-written captions per image (${R.images * 3} in total), sample_images/references.json`],
      ["Metrics", "BLEU-1…4, ROUGE-L, CIDEr-D (own implementation, unit-tested), mean ITM match, latency"],
      ["Hardware", "4-core x86-64 CPU, 16 GB RAM, no GPU; PyTorch with 3 intra-op threads"],
      ["Precision", "float32"],
      ["Models", "BLIP-large and BLIP-base captioners, BLIP-ITM (COCO), BLIP-VQA"],
      ["Decoding defaults", "max 30 new tokens, min 5, repetition penalty 1.1, no-repeat 3-gram, top-p 0.9, T 0.9"],
      ["Protocol", "Models pre-loaded; one warm-up image per configuration; wall-clock time per image"],
    ],
    "Experimental setup",
    [1.7, 6.1]),
  P("The images span people, animals, food, vehicles, landscapes and paintings, and they were not used to tune any model. Because the ITM match is measured with the same model that performs re-ranking, it is partly self-referential; CIDEr-D, BLEU and ROUGE-L against human references are the independent measures."),

  H2("7.3", "Performance Measures"),
  H3("7.3.1", "Caption Quality"),
  P("{tab:main} reports all metrics for the five configurations, from a naive baseline (BLIP-base with greedy decoding) to the two PixelProse modes."),
  TAB("main",
    ["Configuration", "BLEU-1", "BLEU-4", "ROUGE-L", "CIDEr-D", "ITM match", "sec/img"],
    order.map((k) => [names[k], f3(r[k]["BLEU-1"]), f3(r[k]["BLEU-4"]), f3(r[k]["ROUGE-L"]), f3(r[k]["CIDEr-D"]), pc(r[k]["ITM match"]), r[k]["sec / image"].toFixed(1)]),
    "Caption quality and speed of the evaluated configurations",
    [2.3, 0.8, 0.8, 0.95, 0.95, 0.85, 0.8]),
  FIG("cider", "cider.png", "CIDEr-D of the evaluated configurations", 5.4),
  P(`{fig:cider} and {fig:bleu} visualise the results. Three observations stand out. **First, decoding matters more than model size:** BLIP-large with greedy decoding scores *below* BLIP-base with greedy decoding (CIDEr-D ${f3(r["large-greedy"]["CIDEr-D"])} vs ${f3(r["base-greedy"]["CIDEr-D"])}). Beam search unlocks the larger model and gives the best reference-based scores, a ${gain} % CIDEr-D gain over the baseline and the highest BLEU at every n-gram order. **Second, ITM re-ranking buys grounding almost for free:** choosing among the five beams with the ITM model keeps CIDEr-D within 0.6 % of plain beam search (${f3(r["beam-rerank"]["CIDEr-D"])} vs ${f3(r["large-beam5"]["CIDEr-D"])}) while raising the image-match from ${pc(r["large-beam5"]["ITM match"])} to ${pc(r["beam-rerank"]["ITM match"])}. It is also deterministic, which makes results reproducible and cacheable, so it is the default *Balanced* mode. **Third, the Detailed mode** reaches the highest image-match (${pc(r.full["ITM match"])}) with richer, more specific captions, but the short references do not contain those extra details, so its n-gram scores drop slightly.`),
  FIG("bleu", "bleu_rouge.png", "BLEU-1…4 and ROUGE-L of the evaluated configurations", 5.8),

  H3("7.3.2", "Quality–Speed Trade-off"),
  P(`{fig:tradeoff} plots image-match against latency, with bubble area proportional to CIDEr-D. BLIP-base answers in about ${r["base-greedy"]["sec / image"].toFixed(1)} s and is the right choice for older laptops. The Balanced mode sits at about ${r["beam-rerank"]["sec / image"].toFixed(1)} s with high CIDEr-D and 92 % match, and the Detailed mode trades about ${(r.full["sec / image"] - r["beam-rerank"]["sec / image"]).toFixed(1)} extra seconds for the highest grounding. All configurations meet the non-functional requirement of under 5 seconds per caption on a laptop CPU, except the optional Detailed mode.`),
  FIG("tradeoff", "tradeoff.png", "Image–text match versus latency (bubble area ∝ CIDEr-D)", 5.0),

  H3("7.3.3", "Latency Breakdown"),
  P("{tab:latency} breaks down the Balanced pipeline on five sample images, as reported in the interface's *Pipeline timing* panel. The ViT encoding and beam decoding take roughly equal time. The batched scoring pass costs under half a second thanks to batching, and ITM re-ranking adds about one second."),
  TAB("latency",
    ["Image", "Vision (ms)", "Decode (ms)", "Scoring (ms)", "Re-rank (ms)", "Total (ms)"],
    [
      ["woman_and_dog_on_beach", "1450", "1158", "438", "871", "3917"],
      ["two_cats_sleeping", "1413", "1130", "417", "1654", "4614"],
      ["street_with_bus", "1366", "1311", "446", "968", "4091"],
      ["pizza", "1183", "1103", "540", "1447", "4274"],
      ["red_sports_car", "1334", "1148", "426", "1028", "3936"],
      ["Mean", "1349", "1170", "453", "1194", "4166"],
    ],
    "Latency of each pipeline stage in Balanced mode (4-core CPU)",
    [2.4, 1.05, 1.05, 1.1, 1.1, 1.1]),
  P("Repeated requests for the same image and settings are served from the result cache in a few milliseconds, and switching to BLIP-base or a CUDA GPU reduces latency further."),

  H3("7.3.4", "Performance by Category"),
  P("{fig:category} shows ROUGE-L by image category. Artworks, animals, vehicles and people are described well. Nature scenes score lowest because landscapes admit many equally valid descriptions (“a mountain valley”, “a green valley surrounded by mountains”, “a scenic view”), so word overlap with any one reference is naturally low. This illustrates a known limitation of reference-based metrics rather than a failure of the model."),
  FIG("category", "per_category.png", "ROUGE-L by image category", 5.2),

  H2("7.4", "Qualitative Results"),
  P("{fig:qual} shows captions produced by the default Balanced mode for six test images, with one human reference each. The captions are accurate, fluent and often more specific than the references: the model notices the *blue* bus, the pug's wig *and jacket*, and the *blue and white* plate."),
  FIG("qual", "qualitative.png", "Qualitative results of PixelProse (Balanced mode) with human references", 6.2),
  TAB("examples",
    ["Image", "BLIP-base greedy", "BLIP-large beam-5", "PixelProse Balanced", "PixelProse Detailed"],
    [
      "vehicles/airliners_at_airport.jpg", "people/street_with_bus.jpg", "food/stir_fry_plate.jpg",
      "animals/pug_in_wig.jpg", "art/the_scream_painting.jpg",
    ].map((k) => [k.split("/")[1].replace(".jpg", ""), R.captions["base-greedy"][k], R.captions["large-beam5"][k], R.captions["beam-rerank"][k], R.captions.full[k]]),
    "Captions produced by different configurations",
    [1.3, 1.6, 1.6, 1.65, 1.65]),
  P("{tab:examples} compares configurations on the same images. Re-ranking corrects vague beam outputs: “a number of airplanes on a run way” becomes “a number of airplanes on a runway near a building”, and “topped with lots of food” becomes “topped with sliced up vegetables”. The last row shows the risk of sampling: in Detailed mode the model recognised *The Scream* but produced misspelled names (“an edvardt is the scream, painting by edvard stamten”), which the matcher still scored highly because the painting really is *The Scream*. This failure case motivated making the deterministic Balanced mode the default."),

  H2("7.5", "Visual Question Answering Results"),
  TAB("vqa",
    ["Image", "Question", "Answer", "Confidence"],
    [
      ["woman_and_dog_on_beach", "What is the woman wearing?", "plaid shirt", "56.4 %"],
      ["woman_and_dog_on_beach", "Where was this taken?", "beach", "67.2 %"],
      ["woman_and_dog_on_beach", "Is the dog happy?", "yes", "84.7 %"],
      ["woman_and_dog_on_beach", "What animal is this?", "dog", "89.3 %"],
      ["two_cats_sleeping", "How many cats are there?", "2", "89.5 %"],
      ["two_cats_sleeping", "What color is the blanket?", "pink", "87.0 %"],
      ["two_cats_sleeping", "Are the cats sleeping?", "yes", "88.1 %"],
      ["street_with_bus", "What color is the bus?", "blue", "71.8 %"],
      ["pizza", "What food is this?", "pizza", "90.7 %"],
      ["pizza", "Is there cheese on it?", "yes", "89.6 %"],
      ["red_sports_car", "What color is the car?", "red", "87.8 %"],
      ["giraffe_and_zebra", "What animals are there?", "giraffe and zebra", "—"],
      ["school_bus", "How many animals are there?", "0", "—"],
    ],
    "Sample visual question answering results",
    [2.1, 2.5, 1.7, 1.2]),
  P("{tab:vqa} lists answers produced by the Ask feature. All answers shown are correct. The model handles colours, counting, yes/no questions, locations and object identity, and correctly answers “0” when asked about animals in a picture that contains none. Each answer takes 0.5–0.9 s. The least confident answers concern subjective or fine-grained attributes (clothing, time of day), and counting larger groups is less reliable: for the street scene “how many people are there?” returned “5” with only 39 % confidence."),

  H2("7.6", "Explainability Results"),
  P("The Grad-CAM heatmaps ({fig:s_heat}) consistently localise content words: nouns such as *dog*, *woman*, *pizza* or *bus* highlight the corresponding objects, while function words (“a”, “on”, “of”) produce diffuse maps and are displayed in a muted style. Computing the maps for a full caption takes about 0.5 s on the CPU. The per-word probability chart complements the maps. In the beach example, “sitting” (25 %) and “next” (21 %) are the least certain words, which matches intuition: the woman is sitting, but the dog could equally be described as “with” rather than “next to” her. The Match tab gives a further diagnostic. A correct description scores 99.3 %, a partially correct one (“a dog giving a high five”) 29.1 % and unrelated ones 0.0 %, showing that the matcher reasons about the whole scene rather than single keywords."),

  H2("7.7", "Engineering Findings"),
  P("Testing surfaced three issues whose diagnosis improved the system significantly ({tab:findings})."),
  TAB("findings",
    ["Issue", "Root cause", "Fix", "Effect"],
    [
      ["Correct captions received a 2 % ITM match", "Text config used 8 attention heads instead of BLIP's 12; weights loaded without error", "Set num_attention_heads = 12; validate against reference outputs", "Match rose to 99.6 %, equal to the official reference value"],
      ["A caption took > 90 s in the browser vs 5 s from the command line", "PyTorch threads spin-wait; browser rendering occupied one of four cores", "Use cores − 1 threads, serialise CPU inference, pause animations during inference", "≈ 8 s end-to-end in a headless browser, > 10× faster"],
      ["Nonsense words such as “arafed” in captions", "Unconditional decoding of BLIP-large (trained with a prompt)", "Condition on “a picture of” and clean known artefacts", "Clean, fluent captions"],
    ],
    "Engineering issues found during testing",
    [1.8, 2.2, 2.1, 1.7]),

  H2("7.8", "Comparative Analysis"),
  H3("7.8.1", "Comparison with Published Models"),
  P("{tab:lit_cmp} places BLIP, the model family used by PixelProse, among the captioning models reviewed in Chapter 2, using the BLEU-4 and CIDEr scores reported by their authors on the MS-COCO Karpathy test split. BLIP-large improves BLEU-4 by 12.7 points over the original Show-and-Tell model and is competitive with much larger systems. BLIP-2 scores higher but uses billions of parameters and generally requires a GPU, which conflicts with our requirement to run on a laptop CPU. The COCO numbers are computed on 5,000 images with five references each and CIDEr scaled by 100, so they are not directly comparable with the scores on our 44-image set."),
  TAB("lit_cmp",
    ["Model", "Year", "Encoder / decoder", "BLEU-4", "CIDEr", "Runs on laptop CPU"],
    [
      ["Show and Tell (NIC) {ref:vinyals}", "2015", "CNN / LSTM", "27.7", "—", "Yes (small)"],
      ["Show, Attend and Tell (soft) {ref:xu}", "2015", "CNN grid + attention / LSTM", "24.3", "—", "Yes"],
      ["Bottom-Up Top-Down {ref:anderson}", "2018", "Faster R-CNN / LSTM", "36.3", "120.1", "Slow (detector)"],
      ["M² Transformer {ref:cornia}", "2020", "Regions / Transformer", "39.1", "131.2", "Slow (detector)"],
      ["Oscar-L {ref:oscar}", "2020", "Regions + tags / BERT", "41.7", "140.0", "Slow (detector)"],
      ["**BLIP ViT-L (used here)** {ref:blip}", "2022", "ViT-L / BERT decoder", "40.4", "136.7", "**Yes (≈ 4 s)**"],
      ["BLIP-2 {ref:blip2}", "2023", "ViT-g + Q-Former / LLM", "43.7", "145.8", "No (GPU)"],
    ],
    "Published results on MS-COCO (Karpathy test split) as reported by the authors",
    [2.4, 0.6, 1.9, 0.75, 0.75, 1.4]),

  H3("7.8.2", "Comparison with Existing Systems"),
  P("{tab:sys_cmp} compares PixelProse with typical kinds of existing captioning solutions: cloud vision APIs from major providers, online research demos of captioning models, and a basic single-call script that uses a pre-trained model."),
  TAB("sys_cmp",
    ["Feature", "Cloud vision API", "Online model demo", "Basic script", "PixelProse"],
    [
      ["Works offline / private", "No", "No", "Yes", "Yes"],
      ["Cost per image", "Paid", "Free (rate-limited)", "Free", "Free"],
      ["Multiple candidates with scores", "Limited", "No", "No", "Yes"],
      ["Independent verification (ITM)", "No", "No", "No", "Yes"],
      ["Word-level visual explanation", "No", "No", "No", "Yes (Grad-CAM)"],
      ["Per-word probabilities", "No", "No", "No", "Yes"],
      ["Visual question answering", "Separate service", "Separate demo", "No", "Integrated"],
      ["Custom description matching", "No", "No", "No", "Yes"],
      ["Batch + CSV/JSON export", "Via code", "No", "Via code", "Yes (UI)"],
      ["Accessibility (alt-text, speech)", "Alt-text only", "No", "No", "Yes"],
      ["REST API + CLI", "API only", "No", "No", "Both"],
      ["Measured quality (BLEU/CIDEr)", "Not disclosed", "No", "No", "Yes"],
    ],
    "Feature comparison with existing captioning solutions",
    [2.4, 1.3, 1.35, 1.1, 1.65]),
  P("PixelProse is not intended to beat the largest cloud models in raw accuracy. Its contribution is a **complete, explainable, verifiable and private** captioning system that achieves strong measured quality on commodity hardware and makes the internal reasoning of a vision–language transformer visible to its users."),

  H2("7.9", "Limitations"),
  P("The evaluation set of 44 images is small, so the numbers show trends rather than leaderboard results. Captions are single English sentences; dense or paragraph-length descriptions are not produced. The model can miscount larger groups and occasionally misses fine details or proper names such as artworks and landmarks. Being trained on web data, it may reflect social biases present in that data. Finally, about 5 GB of RAM and 4 GB of disk are needed for all four models, which excludes very low-end devices."),
];
