const { H1, H2, P, BUL } = require("../lib");

module.exports = [
  H1(8, "CONCLUSION & FUTURE SCOPE"),

  H2("8.1", "Conclusion"),
  P("In this project we designed, implemented and evaluated **PixelProse**, an explainable image caption generator built on the BLIP family of vision–language transformers. Starting from a survey of captioning research, from template systems through CNN–LSTM encoder–decoders and attention models to large-scale vision–language pre-training, we identified gaps between research models and usable tools: captions are rarely verified or explained, interaction is limited and the strongest models depend on GPUs or paid cloud services."),
  P("PixelProse addresses these gaps with an engineered pipeline around pre-trained BLIP models. The image is encoded once by a Vision Transformer. Several candidate captions are decoded with beam search and, optionally, nucleus sampling. Every candidate is scored by its token probabilities, and an independent image–text matching model verifies and re-ranks the candidates. Grad-CAM on cross-attention makes the model's reasoning visible word by word, a visual question-answering model lets users interrogate the image, and a matching tool lets them test their own descriptions. The system is delivered as an animated, responsive and accessible web application with five input methods, batch processing, history, text-to-speech and shareable cards, together with a documented REST API and a command-line tool."),
  P("We evaluated five configurations on 44 images with 132 hand-written references using our own implementations of BLEU, ROUGE-L and CIDEr-D. Beam search with the large model improved CIDEr-D by 7.6 % over a greedy baseline. The default Balanced mode (beam search with ITM re-ranking) matched that quality (CIDEr-D 1.945) while raising the image–text match from 88 % to 92 %, at about 3.9 seconds per image on a 4-core CPU. The Detailed mode reached 97 % match with richer captions. Visual question answering correctly handled colours, counts, objects and yes/no questions, and the heatmaps consistently localised the objects named in the captions. Along the way, systematic testing uncovered and fixed a silent configuration bug and a CPU thread-contention problem, reinforcing the importance of validating AI systems against known outputs and measuring them end to end."),
  P("All the objectives set out in Section 1.3 were met. PixelProse demonstrates that a modern, explainable and verifiable captioning system can run privately on an ordinary laptop, and it serves as an effective educational tool for understanding how attention-based vision–language models see and describe the world."),

  H2("8.2", "Future Scope"),
  BUL([
    "**Multilingual captions:** add Indian languages such as Hindi, Marathi and Gujarati through a translation model or a multilingual captioner, extending accessibility to non-English speakers.",
    "**Larger vision–language models:** offer BLIP-2, Florence-2 or LLaVA-style models as an optional GPU mode for paragraph-length, dense descriptions.",
    "**Fine-tuning on local data:** fine-tune the captioner on Indian scenes or on domain data (medical imaging, retail products, agriculture) to reduce the Western bias of web training data.",
    "**Video captioning:** describe video clips scene by scene by sampling frames and adding temporal modelling.",
    "**On-device deployment:** quantise the models (INT8) and export them to ONNX or TensorFlow Lite for a mobile application usable by visually impaired users without a computer.",
    "**Reinforcement-learning optimisation:** apply self-critical sequence training with CIDEr and ITM rewards to directly optimise caption quality and grounding.",
    "**Larger evaluation:** evaluate on the full MS-COCO Karpathy test split and with human raters, and add metrics such as SPICE and CLIPScore.",
    "**Bias and safety auditing:** measure and mitigate demographic bias and add filters for sensitive content.",
    "**Integrations:** browser extensions and CMS plug-ins (e.g., WordPress) that generate alt-text automatically when images are uploaded.",
  ]),
];
