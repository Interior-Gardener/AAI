"""
PixelProse from the terminal — caption images without starting the web server.

Examples:
    python cli.py sample_images/animals/zebra.jpg
    python cli.py sample_images/food --model base --csv captions.csv
    python cli.py photo.jpg --prompt "a painting of" --candidates 3
    python cli.py photo.jpg --ask "what color is the car?" --ask "how many people are there?"
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

from PIL import Image

from app.config import settings
from app.services.captioner import CaptionOptions, Captioner
from app.services.image_utils import ImageError, load_image
from app.services.matcher import Matcher
from app.services.model_manager import ModelManager
from app.services.vqa import QuestionAnswerer

EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}
BOLD, DIM, CYAN, VIOLET, GREEN, RED, RESET = "\033[1m", "\033[2m", "\033[36m", "\033[35m", "\033[32m", "\033[31m", "\033[0m"


def collect(paths: list[str]) -> list[Path]:
    files: list[Path] = []
    for p in map(Path, paths):
        if p.is_dir():
            files += sorted(f for f in p.rglob("*") if f.suffix.lower() in EXTENSIONS)
        elif p.is_file():
            files.append(p)
        else:
            print(f"{RED}Not found:{RESET} {p}", file=sys.stderr)
    return files


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("paths", nargs="+", help="image files and/or folders")
    parser.add_argument("--model", choices=["large", "base"], default=settings.default_caption_model)
    parser.add_argument("--strategy", choices=["beam", "hybrid", "sampling"], default="beam")
    parser.add_argument("--candidates", type=int, default=3, help="how many alternative captions to show")
    parser.add_argument("--prompt", default="", help="guided prefix, e.g. 'a painting of'")
    parser.add_argument("--no-rerank", action="store_true", help="skip image-text matching re-ranking")
    parser.add_argument("--ask", action="append", default=[], help="question for visual question answering (repeatable)")
    parser.add_argument("--json", help="save all results to this JSON file")
    parser.add_argument("--csv", help="save captions to this CSV file")
    args = parser.parse_args()

    files = collect(args.paths)
    if not files:
        return 1

    manager = ModelManager(settings)
    matcher = Matcher(manager)
    captioner = Captioner(manager, matcher)
    answerer = QuestionAnswerer(manager) if args.ask else None
    print(f"{DIM}Loading models on {manager.device} (first run downloads them)…{RESET}")

    rows = []
    for path in files:
        try:
            image = load_image(path.read_bytes(), settings.max_upload_bytes).image
        except ImageError as exc:
            print(f"{RED}✗ {path}: {exc}{RESET}")
            continue
        opts = CaptionOptions(model=args.model, strategy=args.strategy, num_candidates=args.candidates,
                              prompt=args.prompt, rerank=not args.no_rerank)
        res = captioner.caption(image, opts)
        match = f" · match {res['match']:.1%}" if res["match"] is not None else ""
        print(f"\n{BOLD}{path}{RESET}")
        print(f"  {VIOLET}{BOLD}{res['sentence']}{RESET}")
        print(f"  {DIM}confidence {res['confidence']:.1%}{match} · {res['timings']['total_ms'] / 1000:.1f}s · {' '.join(res['hashtags'])}{RESET}")
        for i, c in enumerate(res["candidates"][1:], 2):
            print(f"  {DIM}{i}. {c['text']}  ({c['score']:.3f}){RESET}")
        answers = []
        for q in args.ask:
            a = answerer.answer(image, q)
            answers.append(a)
            print(f"  {CYAN}Q:{RESET} {a['question']}  {GREEN}{BOLD}{a['answer']}{RESET}")
        rows.append({"file": str(path), **{k: res[k] for k in ("caption", "sentence", "confidence", "match", "keywords", "hashtags", "candidates")}, "answers": answers})

    if args.json:
        Path(args.json).write_text(json.dumps(rows, indent=2))
        print(f"\n{GREEN}Saved {args.json}{RESET}")
    if args.csv:
        with open(args.csv, "w", newline="", encoding="utf-8") as fh:
            writer = csv.writer(fh)
            writer.writerow(["file", "caption", "confidence", "match", "hashtags"])
            for r in rows:
                writer.writerow([r["file"], r["sentence"], r["confidence"], r["match"], " ".join(r["hashtags"])])
        print(f"{GREEN}Saved {args.csv}{RESET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
