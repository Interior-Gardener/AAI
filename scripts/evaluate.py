"""
Benchmark caption quality and speed on the bundled sample images.

Compares several pipeline configurations (a naive greedy baseline up to the full
PixelProse pipeline) against the hand-written references in sample_images/references.json
and reports BLEU-1..4, ROUGE-L, CIDEr-D, the ITM image-text match and latency.

Usage:
    python scripts/evaluate.py                      # all configurations
    python scripts/evaluate.py --configs full --limit 10
    python scripts/evaluate.py --out reports/eval.json
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from PIL import Image  # noqa: E402

from app.config import settings  # noqa: E402
from app.services.captioner import CaptionOptions, Captioner  # noqa: E402
from app.services.matcher import Matcher  # noqa: E402
from app.services.metrics import evaluate_all  # noqa: E402
from app.services.model_manager import ModelManager  # noqa: E402

CONFIGS = {
    "base-greedy": dict(model="base", strategy="beam", num_beams=1, num_candidates=1, rerank=False),
    "large-greedy": dict(model="large", strategy="beam", num_beams=1, num_candidates=1, rerank=False),
    "large-beam5": dict(model="large", strategy="beam", num_beams=5, num_candidates=1, rerank=False),
    "beam-rerank": dict(model="large", strategy="beam", num_beams=5, num_candidates=5, rerank=True),
    "full": dict(model="large", strategy="hybrid", num_beams=5, num_candidates=5, rerank=True),
}
LABELS = {
    "base-greedy": "BLIP-base, greedy decoding",
    "large-greedy": "BLIP-large, greedy decoding",
    "large-beam5": "BLIP-large, beam search (k=5)",
    "beam-rerank": "PixelProse Balanced (default): 5 beams + ITM re-rank",
    "full": "PixelProse Detailed: beam + sampling + ITM re-rank",
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--configs", nargs="*", default=list(CONFIGS), choices=list(CONFIGS))
    parser.add_argument("--limit", type=int, default=0, help="only use the first N images")
    parser.add_argument("--out", default="reports/evaluation.json")
    parser.add_argument("--merge", action="store_true", help="add to an existing report instead of replacing it")
    args = parser.parse_args()

    refs_all = json.loads((settings.samples_dir / "references.json").read_text())
    refs_all.pop("_about", None)
    keys = sorted(refs_all)[: args.limit or None]
    refs = {k: refs_all[k] for k in keys}
    images = {k: Image.open(settings.samples_dir / k).convert("RGB") for k in keys}

    manager = ModelManager(settings)
    matcher = Matcher(manager)
    captioner = Captioner(manager, matcher)
    print(f"Device: {manager.device} · {len(keys)} images · threads={__import__('torch').get_num_threads()}")

    out = ROOT / args.out
    report = {"images": len(keys), "device": manager.device.type, "results": {}, "captions": {}}
    if args.merge and out.exists():
        report = json.loads(out.read_text())
    for name in args.configs:
        captioner.caption(images[keys[0]], CaptionOptions(**CONFIGS[name]))  # warm-up (load + first-call overhead)
        hyps, times, matches, confs = {}, [], [], []
        for i, k in enumerate(keys, 1):
            start = time.perf_counter()
            res = captioner.caption(images[k], CaptionOptions(**CONFIGS[name]))
            times.append(time.perf_counter() - start)
            hyps[k] = res["caption"]
            confs.append(res["confidence"])
            # Always measure image-text agreement, even for configs that do not re-rank.
            matches.append(res["match"] if res["match"] is not None else matcher.score(images[k], [res["caption"]])[0]["match"])
            print(f"  [{name}] {i:>2}/{len(keys)}  {times[-1]:5.1f}s  {k:<40} {res['caption']}")
        scores = evaluate_all(hyps, refs)
        scores.update({
            "ITM match": statistics.mean(matches),
            "LM confidence": statistics.mean(confs),
            "sec / image": statistics.mean(times),
        })
        report["results"][name] = scores
        report["captions"][name] = hyps

    report["results"] = {k: report["results"][k] for k in CONFIGS if k in report["results"]}  # stable order
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2))

    cols = ["BLEU-1", "BLEU-4", "ROUGE-L", "CIDEr-D", "ITM match", "sec / image"]
    print("\n| Configuration | " + " | ".join(cols) + " |")
    print("|---|" + "---:|" * len(cols))
    for name, s in report["results"].items():
        cells = [f"{s[c]:.3f}" if c != "sec / image" else f"{s[c]:.1f}" for c in cols]
        print(f"| {LABELS[name]} | " + " | ".join(cells) + " |")
    print(f"\nSaved {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
