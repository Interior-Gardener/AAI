const { H1, H2, H3, P, BUL, FIG, TAB } = require("../lib");

module.exports = [
  H1(2, "REVIEW OF LITERATURE"),

  H2("2.1", "Literature Survey"),
  P("**Survey strategy.** We began with two comprehensive surveys of deep-learning-based image captioning {ref:hossain} {ref:stefanini} to understand the overall taxonomy of the field. From their references we followed the most-cited works in each generation of methods: template-based systems, CNN–RNN encoder–decoders, attention-based models, transformer models and large-scale vision–language pre-training. We searched Google Scholar, IEEE Xplore, the CVF Open Access repository and arXiv for “image captioning”, “vision-language pre-training”, “visual attention”, “visual question answering” and “caption evaluation metric”, and prioritised peer-reviewed papers from CVPR, ICCV, ECCV, ICML, NeurIPS, ICLR and ACL. For each paper we recorded the methodology, the dataset, the reported results and the limitations relevant to our goals of accuracy, explainability and deployability. The survey is presented in text in this section and in tabular form in {tab:lit}. {fig:timeline} places the key works on a timeline."),
  FIG("timeline", "timeline.png", "Evolution of image captioning approaches (2010–2023)", 6.2),

  H3("2.1.1", "Template and Retrieval-Based Methods"),
  P("The earliest captioning systems generated sentences by filling linguistic templates with the outputs of object, attribute and scene detectors. *Baby Talk* by Kulkarni et al. {ref:kulkarni} detected objects and their spatial relations, built a conditional random field over them and rendered the most probable labelling through templates such as “*the [adjective] [object] is [preposition] the [object]*”. Retrieval-based approaches instead searched a large captioned database for visually similar images and transferred their captions. Both families produce grammatical but rigid sentences and cannot describe novel combinations of objects, which motivated the move to end-to-end neural generation."),

  H3("2.1.2", "CNN–RNN Encoder–Decoder Models"),
  P("Vinyals et al. introduced *Show and Tell* {ref:vinyals}, the Neural Image Caption (NIC) generator, which framed captioning as machine translation from pixels to words. A GoogLeNet CNN encodes the image into a single feature vector that initialises a Long Short-Term Memory (LSTM) decoder, and the whole network is trained end to end to maximise the likelihood of the reference caption. NIC achieved a BLEU-4 of 27.7 on MS-COCO {ref:coco} and demonstrated that a single neural network could outperform complex pipelines. In parallel, Karpathy and Fei-Fei {ref:karpathy} aligned image regions with sentence fragments using a multimodal embedding and generated region-level descriptions with an RNN; their train/validation/test split of COCO (the *Karpathy split*) became the standard benchmark. The main limitation of these models is the *information bottleneck*: compressing an entire scene into one vector loses the spatial detail needed to describe multiple objects."),

  H3("2.1.3", "Visual Attention"),
  P("Xu et al. removed the bottleneck in *Show, Attend and Tell* {ref:xu}. The CNN produces a 14×14 grid of feature vectors, and at every time step the LSTM computes attention weights over the grid, attending to the region relevant to the next word. The paper proposed both deterministic “soft” and stochastic “hard” attention and visualised the attention maps, an early form of explainability that directly inspired our heatmap feature. Lu et al. {ref:lu} observed that non-visual words such as “the” or “of” should not rely on the image at all and proposed *adaptive attention* with a visual sentinel that lets the model decide when to look. Rennie et al. {ref:rennie} introduced *self-critical sequence training* (SCST), a reinforcement-learning technique that directly optimises the non-differentiable CIDEr metric and substantially improved scores."),
  P("Anderson et al. proposed *Bottom-Up and Top-Down attention* {ref:anderson}. A Faster R-CNN object detector (bottom-up) proposes salient object regions, and a two-layer LSTM (top-down) attends over these object-level features instead of a uniform grid. The approach reached a BLEU-4 of 36.3 and a CIDEr of 120.1 on COCO and also won the 2017 VQA challenge, showing that the same visual representation serves captioning and question answering. Its drawbacks are the expensive detector and the dependence on the detector's object vocabulary."),

  H3("2.1.4", "Transformer-Based Captioning"),
  P("Vaswani et al. introduced the *Transformer* {ref:vaswani}, an architecture based entirely on multi-head self-attention without recurrence. It captures long-range dependencies and trains in parallel. Cornia et al. applied it to captioning in the *Meshed-Memory Transformer* (M²) {ref:cornia}, whose encoder learns a-priori knowledge through memory slots and whose decoder attends to all encoder layers through a meshed connectivity. It achieved a BLEU-4 of 39.1 and a CIDEr of 131.2. Dosovitskiy et al. then showed with the *Vision Transformer* (ViT) {ref:dosovitskiy} that a pure transformer applied to sequences of 16×16 image patches matches or beats CNNs when pre-trained on sufficient data. The ViT is the image encoder used by BLIP and hence by PixelProse."),

  H3("2.1.5", "Vision–Language Pre-training"),
  P("The next leap came from pre-training on large image–text corpora before fine-tuning. *Oscar* {ref:oscar} used object tags detected in the image as anchor points to align visual regions with words during pre-training, reaching a BLEU-4 of 41.7 and a CIDEr of 140.0 on COCO. Radford et al.'s *CLIP* {ref:clip} trained separate image and text encoders with a *contrastive* objective on 400 million web pairs, learning a joint embedding space with remarkable zero-shot transfer. However, CLIP has no decoder and cannot generate text. *ALBEF* {ref:albef} proposed aligning image and text representations with a contrastive loss before fusing them with cross-attention, together with momentum distillation to cope with noisy web data. It also demonstrated Grad-CAM visualisations on the cross-attention layers, the technique we adopt for explainability."),
  P("Li et al.'s **BLIP** {ref:blip}, the foundation of this project, unifies understanding and generation in a *Multimodal mixture of Encoder–Decoder* (MED). A ViT image encoder is shared by three heads trained jointly: an image–text contrastive (ITC) loss that aligns unimodal embeddings, an image–text matching (ITM) loss that classifies whether a pair matches using cross-attention, and a language-modelling (LM) loss that trains an image-grounded decoder to generate text. BLIP also introduced **CapFilt**: a captioner generates synthetic captions for web images and a filter removes noisy original and synthetic captions, bootstrapping a cleaner 129-million-image dataset. The ViT-L model reaches a BLEU-4 of 40.4 and a CIDEr of 136.7 on COCO. Crucially for us, the ITM head provides a built-in way to *verify* a caption, and the model is small enough (446M parameters) to run on a laptop CPU."),
  P("Later work scales the idea further. *GIT* {ref:git} simplified the architecture to one image encoder and one text decoder trained on up to 0.8 billion pairs. *BLIP-2* {ref:blip2} bridges a frozen image encoder and a frozen large language model with a lightweight *Querying Transformer*, achieving a BLEU-4 of 43.7 and a CIDEr of 145.8 on COCO. These models, however, need billions of parameters and generally a GPU, which conflicts with our goal of running on student hardware."),

  H3("2.1.6", "Explainability, Question Answering and Evaluation"),
  P("Selvaraju et al.'s **Grad-CAM** {ref:gradcam} produces class-discriminative localisation maps by weighting feature maps with the gradients of the output score, and it applies to any differentiable architecture. Antol et al. defined **Visual Question Answering** (VQA) {ref:vqa}: answering free-form natural-language questions about an image, a task that tests fine-grained understanding. BLIP provides a VQA model built on the same backbone. For evaluation, **BLEU** {ref:bleu} measures modified n-gram precision with a brevity penalty, **ROUGE-L** {ref:rouge} measures the longest common subsequence with the references, **CIDEr** {ref:cider} weights n-grams by TF-IDF to reward informative words and correlates best with human consensus, and **SPICE** {ref:spice} compares scene graphs. On decoding, Holtzman et al. {ref:holtzman} showed that beam search tends to produce generic, repetitive text and proposed *nucleus (top-p) sampling*, which motivates our combination of both strategies."),

  H3("2.1.7", "Summary of Literature"),
  TAB("lit",
    ["Sr.", "Authors (Year)", "Method", "Dataset", "Key result", "Limitation"],
    [
      ["1", "Kulkarni et al. (2011)", "Detectors + CRF + templates", "PASCAL", "Grammatical template sentences", "Rigid, cannot describe novel scenes"],
      ["2", "Vinyals et al. (2015)", "CNN encoder + LSTM decoder (NIC)", "MS-COCO, Flickr", "BLEU-4 27.7 on COCO", "Single-vector bottleneck"],
      ["3", "Karpathy & Fei-Fei (2015)", "Region–word alignment + RNN", "Flickr8K/30K, COCO", "Region-level descriptions; standard split", "Weak global coherence"],
      ["4", "Xu et al. (2015)", "Soft / hard visual attention over CNN grid", "Flickr, COCO", "BLEU-4 24.3 (soft); attention maps", "Grid features, LSTM decoding"],
      ["5", "Lu et al. (2017)", "Adaptive attention, visual sentinel", "Flickr30K, COCO", "Better grounding of visual words", "Still LSTM-based"],
      ["6", "Rennie et al. (2017)", "Self-critical RL on CIDEr", "COCO", "Large CIDEr gains", "Optimises metric, may hurt fluency"],
      ["7", "Anderson et al. (2018)", "Bottom-up detector + top-down attention", "COCO, VQA v2", "BLEU-4 36.3, CIDEr 120.1", "Costly object detector"],
      ["8", "Vaswani et al. (2017)", "Transformer (self-attention only)", "WMT translation", "State of the art, parallel training", "Text-only"],
      ["9", "Cornia et al. (2020)", "Meshed-memory transformer", "COCO", "BLEU-4 39.1, CIDEr 131.2", "Detector features, no pre-training"],
      ["10", "Dosovitskiy et al. (2021)", "Vision Transformer on 16×16 patches", "ImageNet, JFT-300M", "Matches CNNs at scale", "Needs large pre-training"],
      ["11", "Li et al. – Oscar (2020)", "VLP with object-tag anchors", "6.5M pairs; COCO", "BLEU-4 41.7, CIDEr 140.0", "Relies on detector tags"],
      ["12", "Radford et al. – CLIP (2021)", "Contrastive image–text encoders", "400M web pairs", "Strong zero-shot transfer", "Cannot generate captions"],
      ["13", "Li et al. – ALBEF (2021)", "Align-before-fuse, momentum distillation", "14M pairs", "Strong retrieval; Grad-CAM grounding", "Not a captioner by default"],
      ["14", "Li et al. – BLIP (2022)", "MED (ITC+ITM+LM) with CapFilt", "129M pairs; COCO", "BLEU-4 40.4, CIDEr 136.7 (ViT-L)", "Single caption, no explanation UI"],
      ["15", "Wang et al. – GIT (2022)", "Unified generative image-to-text", "0.8B pairs", "Strong captioning & VQA", "Very large; GPU required"],
      ["16", "Li et al. – BLIP-2 (2023)", "Frozen ViT + Q-Former + frozen LLM", "129M pairs; COCO", "BLEU-4 43.7, CIDEr 145.8", "Billions of parameters"],
      ["17", "Selvaraju et al. (2017)", "Gradient-weighted class activation maps", "ImageNet, VQA", "Visual explanations for any CNN", "Coarse resolution"],
      ["18", "Antol et al. (2015)", "Visual question answering task", "VQA (COCO images)", "Benchmark for image QA", "Answer priors / biases"],
      ["19", "Vedantam et al. (2015)", "CIDEr consensus metric", "PASCAL-50S, ABSTRACT-50S", "Best agreement with humans", "Needs multiple references"],
      ["20", "Holtzman et al. (2020)", "Nucleus (top-p) sampling", "Open-ended text", "Less repetitive, more natural text", "Randomness, can drift"],
    ],
    "Summary of the literature survey",
    [0.5, 1.6, 2.0, 1.25, 1.75, 1.6]),

  H2("2.2", "Research Gaps"),
  P("The literature shows rapid progress in benchmark accuracy, but our review identified the following gaps between research models and usable, trustworthy captioning tools:"),
  BUL([
    "**Explainability is rarely delivered to end users.** Attention and Grad-CAM visualisations exist in papers {ref:xu} {ref:gradcam} {ref:albef}, but publicly available captioning tools return plain text only. Users cannot inspect *which region* produced *which word*.",
    "**Captions are not verified.** Generative models are known to hallucinate objects, yet common pipelines return the single highest-likelihood sentence. The ITM head learned during BLIP pre-training {ref:blip} is normally discarded at inference instead of being used to cross-check the generated caption.",
    "**Decoding choices are under-explored in practice.** Papers usually report one decoding setting. The trade-off between beam search, sampling and re-ranking {ref:holtzman} is seldom exposed to or measured for users.",
    "**Heavy compute and cloud dependence.** The strongest recent models {ref:git} {ref:blip2} require GPUs or paid APIs, which excludes students, offline settings and privacy-sensitive users.",
    "**Lack of interactivity.** A single caption summarises an image; question answering and free-text matching are usually separate research demos rather than parts of one tool.",
    "**Limited accessibility features.** Few tools integrate alt-text generation, speech output and keyboard accessibility aligned with WCAG {ref:wcag}.",
  ]),
  P("PixelProse addresses these gaps by combining multi-candidate decoding, ITM-based verification, word-level Grad-CAM explanations, VQA and description matching in a single application that runs locally on a CPU, and by evaluating its decoding strategies with standard metrics."),
];
