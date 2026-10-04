const { H1, H2, H3, P, BUL, FIG, TAB } = require("../lib");

module.exports = [
  H1(4, "PROJECT ANALYSIS & DESIGN"),

  H2("4.1", "Introduction"),
  P("This chapter translates the requirements of Chapter 3 into a design. We follow the Unified Modelling Language (UML) to describe the system from several complementary viewpoints. The *use-case* view captures what users can do. *Sequence* and *activity* diagrams capture the dynamic behaviour. The *state* diagram captures the life cycle of the interface. *Class*, *component* and *deployment* diagrams capture the static structure and the runtime environment. Data Flow Diagrams (DFDs) show how information moves through the system. The chapter closes with the layered system architecture, the REST API design and the user-interface design."),

  H2("4.2", "UML Diagrams"),

  H3("4.2.1", "Use-Case Diagram"),
  P("{fig:usecase} shows the use cases of PixelProse. The primary actor is the **User**, who provides an image through one of five input methods and generates a caption. *Generate caption* includes *Provide image*, and it is extended by *Configure generation settings*, *View candidates and confidence* and *Explain caption*, which are optional behaviours available after a caption exists. The user can also ask questions about the image, score custom descriptions, run batch captioning with export, listen to or download the caption and restore past results from history. A second actor, the **Developer**, accesses the same functionality programmatically through the REST API. The **BLIP models** appear as a supporting system actor that performs inference for captioning, explanation, question answering and matching."),
  FIG("usecase", "usecase.png", "Use-case diagram of PixelProse", 3.9, 5.6),

  H3("4.2.2", "Sequence Diagram – Caption Generation"),
  P("{fig:seqcap} details the message flow for the central use case. After the user clicks *Generate*, the browser starts the scanning animation and posts the image with the chosen settings to /api/caption. The API validates the image with the image utilities and computes its SHA-1 identifier, which serves as a cache key. On a cache hit the stored result is returned immediately. Otherwise the Captioner obtains the BLIP-large model from the Model Manager, encodes the image once with the Vision Transformer, generates candidate sequences with beam search, computes token log-probabilities with one teacher-forced pass and asks the Matcher for image–text match probabilities. The best caption with its candidates and timings is cached and returned. The browser then reveals the caption word by word and, in the background, requests Grad-CAM heatmaps from /api/explain so that they are ready when the user opens the Explain tab."),
  FIG("seqcap", "seq_caption.png", "Sequence diagram for caption generation", 6.2, 4.4),

  H3("4.2.3", "Sequence Diagram – Visual Question Answering"),
  P("{fig:seqvqa} shows how a question is answered. Because the image was already uploaded during captioning, the browser sends only the short image identifier and the question. The API retrieves the image from the in-memory LRU store; if it has expired, a 404 response tells the user to upload it again. Otherwise the QuestionAnswerer runs BLIP-VQA: it encodes the image with ViT-B/16, encodes the question with cross-attention to the image, and decodes a short answer with beam search. The answer and its confidence appear as a chat bubble."),
  FIG("seqvqa", "seq_vqa.png", "Sequence diagram for visual question answering", 5.6),

  H3("4.2.4", "Activity Diagram"),
  P("The activity diagram in {fig:activity} captures the complete workflow, including decisions. The input source determines how the image is obtained. Validation either stops the flow with an error toast or continues to pre-processing. After decoding and scoring, a decision node checks whether re-ranking is enabled and computes the final score accordingly. After the best caption is displayed, a fork runs three activities in parallel: computing the Grad-CAM heatmaps, saving the result to history and optionally speaking the caption. The user may then explore the Explain, Ask and Match features."),
  FIG("activity", "activity.png", "Activity diagram of the captioning workflow", 4.6, 5.6),

  H3("4.2.5", "State Diagram"),
  P("{fig:state} models the life cycle of the Caption Studio interface. It starts in the *Empty* state. Providing an image moves it to *ImageSelected*, and generating moves it to *Generating*, during which the scanning animation and pipeline checklist are shown. A successful response leads to *ResultShown*, a composite state whose sub-states are the five result tabs (Candidates, Explain, Ask, Match and Insights). An error returns the interface to *ImageSelected* with a message. From *ResultShown* the user can regenerate, choose a new image or clear everything."),
  FIG("state", "state.png", "State diagram of the Caption Studio interface", 5.4),

  H3("4.2.6", "Class Diagram"),
  P("{fig:class} presents the main backend classes. **ModelManager** owns up to four **LoadedModel** objects (processor, network and an inference lock) and depends on the **Settings** read from environment variables. **Captioner** uses the ModelManager, delegates re-ranking to the **Matcher** and receives its parameters as a **CaptionOptions** value object, whose normalized() method clamps user input to safe ranges and whose cache_key() identifies deterministic requests. **QuestionAnswerer** uses the ModelManager for VQA. **LRUCache** stores **LoadedImage** objects and results. The text_utils and metrics modules provide stateless functions for caption cleaning and evaluation."),
  FIG("class", "class.png", "Class diagram of the backend", 6.0, 4.4),

  H3("4.2.7", "Component Diagram"),
  P("The component diagram in {fig:component} shows the modular decomposition. In the browser, feature modules (studio.js, explain.js, chat.js, batch.js, history.js) communicate with the server only through api.js, and history is kept in the browser's localStorage. On the server, the FastAPI routes coordinate the Captioner, Matcher, QuestionAnswerer, image and text utilities and the LRU caches. All neural networks are accessed exclusively through the ModelManager, which isolates the rest of the code from model loading, device selection and concurrency concerns."),
  FIG("component", "component.png", "Component diagram", 4.6, 4.6),

  H3("4.2.8", "Deployment Diagram"),
  P("{fig:deployment} shows that the entire system is deployed on a single personal computer. The browser runs the single-page application, and a Python runtime hosts the Uvicorn ASGI server with the FastAPI application and PyTorch. Model weights are read from the local Hugging Face cache and computed on the CPU, a CUDA GPU or Apple MPS. The Hugging Face Hub is contacted only once, to download the weights. Optionally, the server can bind to the local network so that phones on the same Wi-Fi can use the application, which is useful for classroom demonstrations."),
  FIG("deployment", "deployment.png", "Deployment diagram", 5.4),

  H3("4.2.9", "Data Flow Diagrams"),
  P("The context-level DFD (Level 0) in {fig:dfd0} treats PixelProse as a single process. Users send images, settings, questions and descriptions and receive captions, scores, heatmaps and answers; developers exchange REST requests and JSON responses; the model weights supply pre-trained parameters."),
  FIG("dfd0", "dfd0.png", "Data flow diagram – Level 0 (context diagram)", 5.6),
  P("The Level-1 DFD in {fig:dfd1} decomposes the system into seven processes and three data stores. Process 1.0 acquires and validates the image and stores it in D1 (image store). Processes 2.0 to 5.0 form the captioning pipeline: encoding, decoding candidates, scoring and re-ranking, and post-processing. The final result is written to D2 (result cache) and D3 (browser history). Processes 6.0 (explanation) and 7.0 (question answering) read the stored image from D1, so the user never re-uploads it."),
  FIG("dfd1", "dfd1.png", "Data flow diagram – Level 1", 5.0, 4.6),

  H2("4.3", "System Architecture"),
  P("PixelProse follows a three-tier, client–server architecture:"),
  BUL([
    "**Presentation tier:** a single-page web application written in plain HTML, CSS and JavaScript ES modules, with no build step. It handles input, rendering, animations, heatmap drawing, speech and history.",
    "**Application tier:** a FastAPI server exposing REST endpoints. It validates requests with Pydantic, coordinates the services, manages caches and serves the static interface and the OpenAPI documentation.",
    "**Model tier:** four pre-trained BLIP networks managed by the ModelManager, which loads them lazily (or preloads them in a background thread at start-up), selects the device and precision, and serialises CPU inference to avoid thread contention.",
  ]),
  P("The tiers communicate only through well-defined interfaces: JSON and multipart requests between browser and server, and Python method calls between the routes and the services. This separation allows the interface to be replaced, for example by a mobile app, or the models to be swapped, for example for BLIP-2, without changing the other tiers."),

  H2("4.4", "API Design"),
  P("The REST API is summarised in {tab:api}. Images are uploaded once; the server returns an *image_id* (the SHA-1 digest of the file), which follow-up requests reference instead of re-sending the image. Errors use standard HTTP status codes with a human-readable detail message."),
  TAB("api",
    ["Method", "Endpoint", "Input", "Output"],
    [
      ["GET", "/api/health", "—", "Server status, device, per-model state, cache statistics"],
      ["GET", "/api/samples", "—", "List of bundled sample images with categories"],
      ["POST", "/api/caption", "file / url / image_id + settings", "Caption, candidates, confidence, match, word probabilities, palette, metadata, timings"],
      ["POST", "/api/upload", "file", "image_id and metadata (no captioning)"],
      ["POST", "/api/explain", "image_id, text", "24×24 Grad-CAM map per word and overall map"],
      ["POST", "/api/vqa", "image_id, question", "Answer, confidence, latency"],
      ["POST", "/api/match", "image_id, texts[1..8]", "ITM probability and ITC similarity per text"],
      ["POST", "/api/batch", "files[1..12]", "Caption per file with scores or error"],
    ],
    "REST API endpoints",
    [0.8, 1.4, 2.2, 3.4]),

  H2("4.5", "User Interface Design"),
  P("The interface was designed around four principles: **clarity** (one primary action per screen region), **feedback** (every wait is visualised, every action confirmed), **explainability** (model internals such as candidates, probabilities and attention are first-class elements rather than hidden details) and **delight** (purposeful motion and a cohesive visual identity). The page is organised as a single scrolling document with the following sections:"),
  BUL([
    "**Hero:** product name, tagline, call-to-action buttons, animated statistics and a demo card that loops through real model outputs.",
    "**Caption Studio:** an input panel (source tabs, preview, settings, Generate button) beside a result panel (caption card, metric rings and five tabs).",
    "**Batch mode:** multi-file drop zone, progress bar, result grid and export buttons.",
    "**How it works:** an animated five-step pipeline and six technology cards explaining the AI.",
    "**Team:** the three project members.",
    "**Overlays:** history drawer, keyboard-shortcut dialog, toast notifications and tooltips.",
  ]),
  P("The visual language uses a dark glassmorphism theme with violet, indigo and cyan accents, a light theme alternative, the Space Grotesk, Inter and JetBrains Mono typefaces, and design tokens defined once as CSS custom properties. Colour contrast, focus rings and reduced-motion handling were considered from the start. The resulting screens are shown in Chapter 6."),

  H2("4.6", "Data Design"),
  P("PixelProse deliberately avoids a database: images are transient and user data stays in the browser. Three stores exist, as shown in the Level-1 DFD:"),
  BUL([
    "**Image store (server memory):** an LRU cache of the 32 most recent images, keyed by SHA-1 digest, holding the decoded and down-scaled image.",
    "**Result cache (server memory):** an LRU cache of 64 caption results keyed by (image digest, normalised options). Only deterministic beam-search results are cached.",
    "**History (browser localStorage):** the last 30 results with a 480-pixel JPEG thumbnail, the full result JSON and a timestamp. When storage is full the oldest entries are dropped automatically.",
  ]),
];
