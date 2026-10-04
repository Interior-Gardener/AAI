const { H1, H2, H3, P, BUL, NUM, FIG } = require("../lib");

module.exports = [
  H1(1, "INTRODUCTION"),

  H2("1.1", "Introduction"),
  P("Computer vision and natural language processing have long developed as separate branches of Artificial Intelligence. Computer vision teaches machines to recognise objects, scenes and actions in pixels, while natural language processing teaches them to understand and produce human language. **Image captioning** sits exactly at the intersection of the two: given a photograph, a system must understand what is happening in the scene and then express that understanding as a fluent, grammatical sentence such as *“a woman sitting on a beach next to a dog”*. The task is deceptively simple for humans, yet it requires a machine to detect objects, infer their attributes and relationships, decide which details matter, and order words correctly, all in one pass. It is therefore regarded as one of the benchmark problems of multimodal artificial intelligence."),
  P("Early captioning systems relied on hand-written templates filled in by object detectors, or on retrieving the caption of the most similar image from a database. The deep-learning era replaced these with *encoder–decoder* networks: a Convolutional Neural Network (CNN) encoded the image into a vector and a Recurrent Neural Network (RNN) decoded the vector into words. Since 2017 the **Transformer** architecture, built entirely on the attention mechanism, has taken over both halves of the pipeline. Modern *vision–language pre-training* (VLP) models such as BLIP are first trained on hundreds of millions of image–text pairs from the web and then fine-tuned for captioning, reaching near-human scores on standard benchmarks."),
  P("This report presents **PixelProse**, an *explainable* image caption generator developed as our Last-Year Innovation-Based Major Project. PixelProse uses the BLIP family of vision–language transformers from Salesforce Research and wraps them in a complete, locally-running application. Beyond producing a caption, the system generates several candidate sentences and asks a second neural network to verify which one best matches the image. It visualises, word by word, the image regions the model relied on, answers free-form questions about the picture, and measures its own quality with standard research metrics. Everything is delivered through a modern, animated web interface and a REST API, and it runs on an ordinary laptop CPU without any paid cloud service. {fig:intro} shows a typical output of the system."),
  FIG("intro", "intro_example.png", "An example of automatic image captioning by PixelProse", 4.3),

  H3("1.1.1", "Motivation"),
  P("Our motivation comes from three directions. First, **accessibility**: according to the World Health Organization, at least 2.2 billion people live with a near or distance vision impairment {ref:who}. Blind and low-vision users depend on screen readers, which in turn depend on *alternative text* (alt-text) describing each image. Surveys of the most popular websites repeatedly find that more than half of their home pages contain images with missing alt-text {ref:webaim}. Automatic captioning can close much of this gap. Second, **information retrieval**: billions of photographs are uploaded every day, and search engines, digital libraries and photo applications need textual descriptions to index them. Third, **education and trust in AI**: deep networks are frequently criticised as black boxes. A captioning tool that can *explain* its output provides an excellent vehicle for studying and demonstrating how attention-based models actually reason."),

  H3("1.1.2", "Applications of Image Captioning"),
  BUL([
    "**Assistive technology:** describing surroundings, documents and photographs to visually impaired users through text-to-speech.",
    "**Web accessibility compliance:** generating alt-text for websites and content-management systems (WCAG guidelines).",
    "**Search and indexing:** enabling text-based search over large, untagged image collections.",
    "**Social media and marketing:** suggesting captions, keywords and hashtags for posts.",
    "**Content moderation:** summarising the content of uploaded images for automatic or human review.",
    "**Robotics and autonomous systems:** letting robots and smart assistants describe what their cameras see.",
    "**Medical and scientific imaging:** drafting preliminary descriptions of scans or microscopy images (with domain-specific training).",
  ]),

  H2("1.2", "Problem Definition"),
  P("Formally, image captioning is the problem of learning a function that maps an image *I* to a sequence of words *S = (w₁, w₂, …, wₙ)* that describes the image accurately and fluently. The model is trained to maximise the conditional probability *P(S | I)*. At inference time it must search for the most probable sentence among an exponentially large set of possible word sequences."),
  P("Although state-of-the-art models achieve impressive benchmark scores, several practical problems remain when they are used as real tools:"),
  NUM([
    "**Single, unverified output.** Typical tools return one caption with no indication of how reliable it is, even though models sometimes *hallucinate* objects that are not present.",
    "**Lack of explainability.** Users cannot see *why* the model produced a particular word, which limits trust and makes errors hard to diagnose.",
    "**No interaction.** A caption is a fixed summary; users cannot ask follow-up questions about details the caption omitted.",
    "**Dependence on cloud services.** Commercial captioning APIs require an internet connection, charge per request and send private photographs to third-party servers.",
    "**Poor usability for non-experts.** Research code is released as scripts and notebooks rather than as usable applications.",
    "**Unmeasured quality.** Demonstration tools rarely report objective quality metrics, so different decoding choices cannot be compared.",
  ]),
  P("The problem addressed by this project is therefore: **to design and implement an accurate, explainable, interactive and privacy-preserving image caption generator that runs on commodity hardware, and to evaluate its quality objectively using standard captioning metrics.**"),

  H2("1.3", "Aim and Objectives"),
  P("**Aim:** To develop *PixelProse*, a web-based image caption generator built on vision–language transformers that produces accurate natural-language descriptions of images, verifies and explains them, and supports interactive question answering, all running locally on a personal computer."),
  P("**Objectives:**"),
  NUM([
    "To study the evolution of image captioning from CNN–RNN models to vision–language transformers and select a suitable pre-trained model.",
    "To build a caption-generation pipeline that encodes each image once and generates multiple candidate captions using beam search and nucleus sampling.",
    "To estimate the confidence of each caption from token probabilities and to re-rank candidates with an independent image–text matching (ITM) model.",
    "To make the model explainable through word-level Grad-CAM heatmaps over cross-attention and per-word probability visualisation.",
    "To integrate visual question answering (VQA) and free-text description matching so users can interrogate the image.",
    "To design an attractive, responsive and accessible web interface with multiple input methods (upload, drag-and-drop, paste, URL, webcam and samples).",
    "To expose all functionality through a documented REST API and a command-line tool.",
    "To implement the BLEU, ROUGE-L and CIDEr-D metrics and evaluate different decoding configurations on a hand-annotated test set.",
    "To ensure the system runs on a CPU-only laptop with acceptable latency, and to document, test and present the work.",
  ]),

  H3("1.3.1", "Scope of the Project"),
  P("The project covers English-language captioning of still photographs and artworks using pre-trained BLIP models, with inference on CPU, CUDA GPUs or Apple Silicon. Training a captioning model from scratch is outside the scope, because it requires hundreds of millions of image–text pairs and weeks of GPU time. Instead the project demonstrates *transfer learning*: it builds a complete, engineered and evaluated system around publicly released pre-trained weights. Video captioning, multilingual output and domain-specific fine-tuning are identified as future scope."),

  H2("1.4", "Organization of the Report"),
  P("The rest of this report is organised as follows. **Chapter 2** surveys captioning and vision–language research and identifies research gaps. **Chapter 3** specifies the hardware, software, functional and non-functional requirements with the feasibility study and cost estimation. **Chapter 4** presents the UML diagrams, data flow diagrams, system architecture and API and interface design. **Chapter 5** explains the methodology with its mathematical formulation: the Vision Transformer and text decoder, decoding algorithms, candidate scoring and re-ranking, Grad-CAM explainability and the evaluation metrics. **Chapter 6** describes the implementation, screenshots and testing. **Chapter 7** analyses the results and compares the system with existing work, and **Chapter 8** concludes the report with future scope."),
];
