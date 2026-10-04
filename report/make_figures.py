"""
Generates the non-UML figures of the project report into report/figures/.

    python report/make_figures.py

UML diagrams are PlantUML sources in report/diagrams/ (render with: plantuml -tpng -o ../figures *.puml).
Charts use the real benchmark output in reports/evaluation.json.
"""

from __future__ import annotations

import json
import subprocess
import sys
import textwrap
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.services.metrics import evaluate_all  # noqa: E402

OUT = ROOT / "report" / "figures"
OUT.mkdir(parents=True, exist_ok=True)
SAMPLES = ROOT / "sample_images"
EVAL = json.loads((ROOT / "reports" / "evaluation.json").read_text())
REFS = {k: v for k, v in json.loads((SAMPLES / "references.json").read_text()).items() if not k.startswith("_")}

VIOLET, INDIGO, CYAN, PINK, AMBER, GREY = "#7C3AED", "#4F46E5", "#0891B2", "#DB2777", "#D97706", "#9CA3AF"
plt.rcParams.update({"font.family": "DejaVu Serif", "font.size": 11, "axes.spines.top": False, "axes.spines.right": False, "savefig.dpi": 220})

CONFIGS = ["base-greedy", "large-greedy", "large-beam5", "beam-rerank", "full"]
LABELS = ["BLIP-base\ngreedy", "BLIP-large\ngreedy", "BLIP-large\nbeam-5", "PixelProse\nBalanced", "PixelProse\nDetailed"]
COLORS = [GREY, GREY, INDIGO, VIOLET, CYAN]


def font(size, bold=False):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    try:
        return ImageFont.truetype(f"/usr/share/fonts/truetype/dejavu/{name}", size)
    except OSError:
        return ImageFont.load_default()


def dot(name: str, source: str) -> None:
    subprocess.run(["dot", "-Tpng", "-Gdpi=220", "-o", str(OUT / f"{name}.png")], input=source.encode(), check=True)


GRAPH_STYLE = """
  graph [fontname="DejaVu Sans", nodesep=0.35, ranksep=0.45, bgcolor=white];
  node  [fontname="DejaVu Sans", fontsize=11, shape=box, style="rounded,filled", fillcolor="#F5F3FF", color="#5B21B6", penwidth=1.3];
  edge  [fontname="DejaVu Sans", fontsize=9, color="#374151", arrowsize=0.8];
"""


def block_diagram():
    dot("block_diagram", f"""digraph G {{ rankdir=TB; {GRAPH_STYLE}
  in  [label="Input image\\n(upload / URL /\\ncamera / sample)", fillcolor="#ECFEFF", color="#0E7490"];
  pre [label="Pre-processing\\nEXIF · RGB · resize 384²\\nnormalise (CLIP μ, σ)"];
  vit [label="Vision Transformer\\nViT-L/16 · 24 layers\\n→ 577 × 1024 embeddings"];
  dec [label="Text decoder\\n(BERT, cross-attention)\\nbeam search / top-p"];
  sco [label="Token scoring\\nlog P(wᵢ | w<ᵢ, I)\\n→ confidence"];
  itm [label="ITM re-ranker\\n0.65·match + 0.35·conf"];
  post[label="Post-processing\\nclean · keywords ·\\nhashtags · alt-text"];
  out [label="Caption + scores\\n+ insights", fillcolor="#ECFEFF", color="#0E7490"];
  gc  [label="Grad-CAM\\nword heatmaps", fillcolor="#FFFBEB", color="#D97706"];
  vqa [label="BLIP-VQA\\nquestion answering", fillcolor="#FFFBEB", color="#D97706"];
  in -> pre -> vit -> dec -> sco -> itm -> post -> out;
  itm -> gc [style=dashed, label="best caption"];
  pre -> vqa [style=dashed, label="question"];
  {{rank=same; itm; gc}}
  {{rank=same; pre; vqa}}
}}""")


def blip_architecture():
    dot("blip_architecture", f"""digraph G {{ rankdir=BT; {GRAPH_STYLE}
  subgraph cluster_v {{ label="Image encoder (ViT-L/16)"; fontname="DejaVu Sans"; color="#0E7490"; style=rounded;
    img [label="Image 384×384", fillcolor="#ECFEFF", color="#0E7490"];
    patch [label="Patch embedding\\n576 patches × 16×16 px + [CLS]", fillcolor="#ECFEFF", color="#0E7490"];
    enc [label="24 × [ Self-attention → Feed-forward ]", fillcolor="#ECFEFF", color="#0E7490"];
    img -> patch -> enc;
  }}
  subgraph cluster_t {{ label="Image-grounded text decoder (12 layers)"; fontname="DejaVu Sans"; color="#5B21B6"; style=rounded;
    tok [label="[DEC] a picture of  w₁ … wₜ₋₁"];
    csa [label="Causal self-attention"];
    ca  [label="Cross-attention\\n(queries: text, keys/values: image)"];
    ff  [label="Feed-forward"];
    lm  [label="LM head → P(wₜ)"];
    tok -> csa -> ca -> ff -> lm;
  }}
  enc -> ca [label="image embeddings\\n577 × 1024", color="#0E7490", fontcolor="#0E7490"];
  lm -> outp [label="next word"];
  outp [label="“a woman sitting on a beach next to a dog”", shape=note, fillcolor="#FFFBEB", color="#D97706"];
}}""")


def beam_search():
    dot("beam_search", f"""digraph G {{ rankdir=LR; {GRAPH_STYLE}
  node [fontsize=10];
  s  [label="a picture of", fillcolor="#E5E7EB", color="#6B7280"];
  a1 [label="a  (0.80)"]; a2 [label="two  (0.09)", fillcolor="#F3F4F6", color="#9CA3AF"];
  b1 [label="woman  (0.60)"]; b2 [label="girl  (0.21)"]; b3 [label="dog  (0.06)", fillcolor="#F3F4F6", color="#9CA3AF"];
  c1 [label="sitting  (0.25)"]; c2 [label="and  (0.18)"]; c3 [label="is  (0.17)", fillcolor="#F3F4F6", color="#9CA3AF"];
  d1 [label="on a beach …", fillcolor="#DCFCE7", color="#16A34A"]; d2 [label="her dog …"];
  s -> a1; s -> a2 [style=dashed, color="#9CA3AF"];
  a1 -> b1; a1 -> b2; a1 -> b3 [style=dashed, color="#9CA3AF"];
  b1 -> c1; b1 -> c2; b2 -> c3 [style=dashed, color="#9CA3AF"];
  c1 -> d1; c2 -> d2;
}}""")


def gradcam_pipeline():
    dot("gradcam_pipeline", f"""digraph G {{ rankdir=TB; {GRAPH_STYLE}
  i [label="Image + caption", fillcolor="#ECFEFF", color="#0E7490"];
  f [label="ITM forward pass\\n(text encoder with\\ncross-attention)"];
  a [label="Layer-8 cross-attention\\nA ∈ ℝ^(H × T × 577)"];
  s [label="Match logit s\\n(itm_head)"];
  g [label="Gradient\\nG = ∂s / ∂A"];
  c [label="CAM_t = mean_h(A ⊙ ReLU(G))\\n→ 24 × 24 per word"];
  p [label="Gaussian smoothing,\\nnormalise, γ = 0.6"];
  r [label="Browser: turbo colour map,\\nupscale & blend over photo", fillcolor="#FFFBEB", color="#D97706"];
  i -> f -> a -> s; s -> g [label="backprop"]; a -> c; g -> c -> p -> r;
}}""")


def patch_grid():
    im = Image.open(SAMPLES / "people/woman_and_dog_on_beach.jpg").convert("RGB").resize((384, 384))
    big = im.resize((768, 768), Image.Resampling.LANCZOS)
    d = ImageDraw.Draw(big)
    for k in range(1, 24):
        d.line([(k * 32, 0), (k * 32, 768)], fill=(34, 211, 238), width=1)
        d.line([(0, k * 32), (768, k * 32)], fill=(34, 211, 238), width=1)
    d.rectangle([10 * 32, 11 * 32, 11 * 32, 12 * 32], outline=(236, 72, 153), width=4)
    orig = Image.open(SAMPLES / "people/woman_and_dog_on_beach.jpg").convert("RGB")
    orig.thumbnail((900, 768))
    canvas = Image.new("RGB", (orig.width + 768 + 180, 830), "white")
    canvas.paste(orig, (0, (768 - orig.height) // 2 + 30))
    canvas.paste(big, (orig.width + 180, 30))
    d = ImageDraw.Draw(canvas)
    ax = orig.width + 20
    d.line([(ax, 414), (ax + 130, 414)], fill=(55, 65, 81), width=5)
    d.polygon([(ax + 140, 414), (ax + 120, 402), (ax + 120, 426)], fill=(55, 65, 81))
    d.text((ax - 5, 440), "resize to\n384 × 384", fill=(55, 65, 81), font=font(22))
    d.text((orig.width + 180, 0), "24 × 24 = 576 patches of 16 × 16 px (one highlighted)", fill=(17, 24, 39), font=font(22, True))
    canvas.save(OUT / "patch_grid.png")


def intro_example():
    im = Image.open(SAMPLES / "animals/two_cats_sleeping.jpg").convert("RGB")
    im.thumbnail((900, 640))
    W = max(im.width + 60, 1000)
    canvas = Image.new("RGB", (W, im.height + 200), "white")
    im_x = (W - im.width) // 2
    canvas.paste(im, (im_x, 20))
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle([30, im.height + 45, W - 30, im.height + 175], radius=18, fill=(245, 243, 255), outline=(91, 33, 182), width=3)
    d.text((55, im.height + 60), "Generated caption", fill=(91, 33, 182), font=font(22, True))
    d.text((55, im.height + 98), "“A couple of cats laying on top of a pink couch.”", fill=(17, 24, 39), font=font(28))
    d.text((55, im.height + 142), "confidence 61.6%  ·  image-text match 99.9%", fill=(107, 114, 128), font=font(20))
    canvas.save(OUT / "intro_example.png")


def timeline():
    events = [
        (2010, "Template &\nretrieval methods", GREY), (2015, "Show and Tell\n(CNN + LSTM)", INDIGO),
        (2015.9, "Show, Attend\nand Tell", INDIGO), (2017.5, "Transformer\n(Attention)", VIOLET),
        (2018, "Bottom-Up\nTop-Down", INDIGO), (2020, "ViT · Oscar\n· M² Transformer", VIOLET),
        (2021, "CLIP\n(contrastive)", CYAN), (2022, "BLIP\n(this project)", PINK), (2023, "BLIP-2 ·\nLLaVA", CYAN),
    ]
    fig, ax = plt.subplots(figsize=(11, 3.0))
    ax.axhline(0, color="#374151", lw=1.5)
    for i, (x, label, c) in enumerate(events):
        up = 1 if i % 2 == 0 else -1
        ax.plot([x, x], [0, 0.55 * up], color=c, lw=1.4)
        ax.scatter([x], [0], s=60, color=c, zorder=3)
        ax.text(x, 0.62 * up, label, ha="center", va="bottom" if up > 0 else "top", fontsize=9.5, color="#111827")
    ax.set_xlim(2009, 2024.2)
    ax.set_ylim(-1.5, 1.5)
    ax.set_yticks([])
    ax.spines["left"].set_visible(False)
    ax.set_xticks(range(2010, 2025, 2))
    fig.tight_layout()
    fig.savefig(OUT / "timeline.png")
    plt.close(fig)


def bar_chart(metric, fname, ylabel, ylim=None, fmt="{:.3f}"):
    vals = [EVAL["results"][c][metric] for c in CONFIGS]
    fig, ax = plt.subplots(figsize=(8, 4.2))
    bars = ax.bar(LABELS, vals, color=COLORS, width=0.6)
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v, fmt.format(v), ha="center", va="bottom", fontsize=10)
    ax.set_ylabel(ylabel)
    if ylim:
        ax.set_ylim(*ylim)
    ax.grid(axis="y", color="#E5E7EB")
    ax.set_axisbelow(True)
    fig.tight_layout()
    fig.savefig(OUT / fname)
    plt.close(fig)


def bleu_grouped():
    ns = ["BLEU-1", "BLEU-2", "BLEU-3", "BLEU-4", "ROUGE-L"]
    fig, ax = plt.subplots(figsize=(9, 4.2))
    w = 0.16
    for i, c in enumerate(CONFIGS):
        vals = [EVAL["results"][c][n] for n in ns]
        ax.bar([k + (i - 2) * w for k in range(len(ns))], vals, w, label=LABELS[i].replace("\n", " "), color=COLORS[i] if i > 1 else ["#D1D5DB", "#9CA3AF"][i])
    ax.set_xticks(range(len(ns)))
    ax.set_xticklabels(ns)
    ax.set_ylim(0.3, 0.8)
    ax.set_ylabel("score")
    ax.legend(fontsize=8.5, ncol=3, frameon=False, loc="upper right")
    ax.grid(axis="y", color="#E5E7EB")
    ax.set_axisbelow(True)
    fig.tight_layout()
    fig.savefig(OUT / "bleu_rouge.png")
    plt.close(fig)


def tradeoff():
    fig, ax = plt.subplots(figsize=(7.5, 4.4))
    for c, lab, col in zip(CONFIGS, LABELS, COLORS):
        r = EVAL["results"][c]
        ax.scatter(r["sec / image"], r["ITM match"] * 100, s=r["CIDEr-D"] ** 6 * 12, color=col, alpha=0.85, edgecolor="#111827")
        off = {"large-greedy": (-20, -18), "large-beam5": (10, 6)}.get(c, (12, -4))
        ax.annotate(lab.replace("\n", " "), (r["sec / image"], r["ITM match"] * 100), textcoords="offset points", xytext=off, fontsize=9)
    ax.set_xlabel("latency (seconds per image, 4-core CPU)")
    ax.set_ylabel("image-text match (%)")
    ax.set_xlim(0, 7.5)
    ax.set_ylim(85, 100)
    ax.grid(color="#E5E7EB")
    ax.set_axisbelow(True)
    ax.text(0.2, 85.6, "bubble area ∝ CIDEr-D", fontsize=9, color="#6B7280")
    fig.tight_layout()
    fig.savefig(OUT / "tradeoff.png")
    plt.close(fig)


def per_category():
    cats = sorted({k.split("/")[0] for k in REFS})
    data = {}
    for c in ("large-beam5", "beam-rerank"):
        caps = EVAL["captions"][c]
        data[c] = [evaluate_all({k: caps[k] for k in REFS if k.startswith(cat + "/")}, {k: REFS[k] for k in REFS if k.startswith(cat + "/")})["ROUGE-L"] for cat in cats]
    fig, ax = plt.subplots(figsize=(8.5, 4))
    w = 0.38
    ax.bar([i - w / 2 for i in range(len(cats))], data["large-beam5"], w, label="BLIP-large beam-5", color=INDIGO)
    ax.bar([i + w / 2 for i in range(len(cats))], data["beam-rerank"], w, label="PixelProse Balanced", color=VIOLET)
    ax.set_xticks(range(len(cats)))
    ax.set_xticklabels([f"{c}\n(n={sum(k.startswith(c + '/') for k in REFS)})" for c in cats])
    ax.set_ylabel("ROUGE-L")
    ax.set_ylim(0.4, 0.8)
    ax.legend(frameon=False)
    ax.grid(axis="y", color="#E5E7EB")
    ax.set_axisbelow(True)
    fig.tight_layout()
    fig.savefig(OUT / "per_category.png")
    plt.close(fig)
    return cats, data


def literature():
    rows = [("NIC\n(2015)", 27.7), ("Soft-Att.\n(2015)", 24.3), ("Up-Down\n(2018)", 36.3), ("M²-Tr.\n(2020)", 39.1),
            ("Oscar-L\n(2020)", 41.7), ("BLIP-L\n(2022)", 40.4), ("BLIP-2\n(2023)", 43.7)]
    fig, ax = plt.subplots(figsize=(9, 3.9))
    cols = [GREY, GREY, INDIGO, INDIGO, INDIGO, PINK, CYAN]
    bars = ax.bar([r[0] for r in rows], [r[1] for r in rows], color=cols, width=0.6)
    for b, (_, v) in zip(bars, rows):
        ax.text(b.get_x() + b.get_width() / 2, v + 0.4, f"{v}", ha="center", fontsize=10)
    ax.set_ylabel("BLEU-4 (%) on MS-COCO test")
    ax.set_ylim(0, 50)
    ax.grid(axis="y", color="#E5E7EB")
    ax.set_axisbelow(True)
    fig.tight_layout()
    fig.savefig(OUT / "literature.png")
    plt.close(fig)


def qualitative():
    keys = ["people/street_with_bus.jpg", "animals/pug_in_wig.jpg", "vehicles/airliners_at_airport.jpg",
            "food/stir_fry_plate.jpg", "art/starry_night_painting.jpg", "people/tandem_bicycle.jpg"]
    tile_w, img_h, txt_h = 520, 340, 150
    canvas = Image.new("RGB", (tile_w * 3 + 40, (img_h + txt_h) * 2 + 30), "white")
    d = ImageDraw.Draw(canvas)
    for i, k in enumerate(keys):
        x, y = 10 + (i % 3) * (tile_w + 10), 10 + (i // 3) * (img_h + txt_h + 10)
        im = Image.open(SAMPLES / k).convert("RGB")
        scale = max(tile_w / im.width, img_h / im.height)
        im = im.resize((int(im.width * scale) + 1, int(im.height * scale) + 1))
        left, top = (im.width - tile_w) // 2, (im.height - img_h) // 2
        canvas.paste(im.crop((left, top, left + tile_w, top + img_h)), (x, y))
        d.text((x + 4, y + img_h + 8), f"({chr(97 + i)}) PixelProse:", fill=(91, 33, 182), font=font(17, True))
        cap = EVAL["captions"]["beam-rerank"][k]
        d.multiline_text((x + 4, y + img_h + 32), textwrap.fill(cap, 44), fill=(17, 24, 39), font=font(17))
        d.multiline_text((x + 4, y + img_h + 82), textwrap.fill("Reference: " + REFS[k][0], 52), fill=(107, 114, 128), font=font(14))
    canvas.save(OUT / "qualitative.png")


def terminal():
    """Render the real CLI transcript saved in cli_output.txt as a terminal screenshot."""
    lines = (OUT / "cli_output.txt").read_text().splitlines()
    wrapped = []
    for ln in lines:
        wrapped += textwrap.wrap(ln, 84, subsequent_indent="    ") or [""]
    f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 22)
    W, lh = 1260, 32
    img = Image.new("RGB", (W, 70 + lh * len(wrapped) + 20), (17, 17, 27))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 44], fill=(40, 40, 56))
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        d.ellipse([18 + i * 28, 14, 34 + i * 28, 30], fill=c)
    d.text((W // 2 - 90, 11), "Terminal — PixelProse CLI", fill=(170, 170, 190), font=font(18))
    y = 62
    for ln in wrapped:
        s = ln.strip()
        col = (220, 220, 230)
        if ln.startswith("$"):
            col = (134, 239, 172)
        elif s.startswith("sample_images"):
            col = (255, 255, 255)
        elif s and s[0].isupper() and s.endswith("."):
            col = (196, 181, 253)
        elif s.startswith("Q:"):
            col = (103, 232, 249)
        elif s.startswith(("confidence", "2.", "3.", "Loading")):
            col = (140, 140, 160)
        d.text((24, y), ln, fill=col, font=f)
        y += lh
    img.save(OUT / "cli.png")


def heat_pair():
    imgs = ROOT / "docs" / "images"
    a, b = Image.open(imgs / "heat_dog.jpg").convert("RGB"), Image.open(imgs / "heat_woman.jpg").convert("RGB")
    h = min(a.height, b.height)
    a, b = a.resize((int(a.width * h / a.height), h)), b.resize((int(b.width * h / b.height), h))
    canvas = Image.new("RGB", (a.width + b.width + 30, h + 70), "white")
    canvas.paste(a, (0, 0))
    canvas.paste(b, (a.width + 30, 0))
    d = ImageDraw.Draw(canvas)
    d.text((a.width // 2 - 120, h + 12), "(a) word “dog”", fill=(8, 145, 178), font=font(34, True))
    d.text((a.width + 30 + b.width // 2 - 150, h + 12), "(b) word “woman”", fill=(219, 39, 119), font=font(34, True))
    canvas.save(OUT / "heat_pair.png")


def ask_match():
    imgs = ROOT / "docs" / "images"
    a, b = Image.open(imgs / "ask_crop.jpg").convert("RGB"), Image.open(imgs / "match_crop.jpg").convert("RGB")
    h = max(a.height, b.height)
    a, b = a.resize((int(a.width * h / a.height), h)), b.resize((int(b.width * h / b.height), h))
    canvas = Image.new("RGB", (a.width + b.width + 40, h + 80), "white")
    canvas.paste(a, (0, 0))
    canvas.paste(b, (a.width + 40, 0))
    d = ImageDraw.Draw(canvas)
    d.text((a.width // 2 - 40, h + 18), "(a) Ask", fill=(17, 24, 39), font=font(40, True))
    d.text((a.width + 40 + b.width // 2 - 60, h + 18), "(b) Match", fill=(17, 24, 39), font=font(40, True))
    canvas.save(OUT / "ask_match.png")


def main():
    ask_match()
    heat_pair()
    terminal()
    block_diagram()
    blip_architecture()
    beam_search()
    gradcam_pipeline()
    patch_grid()
    intro_example()
    timeline()
    bar_chart("CIDEr-D", "cider.png", "CIDEr-D", ylim=(1.5, 2.05), fmt="{:.3f}")
    bleu_grouped()
    tradeoff()
    cats, data = per_category()
    literature()
    qualitative()
    (OUT / "per_category.json").write_text(json.dumps({"categories": cats, "rouge_l": data}, indent=2))
    print("figures written to", OUT)


if __name__ == "__main__":
    main()
