"""
Download every model the app uses into the Hugging Face cache (≈ 4 GB, one time only).

Run this once on good Wi-Fi before a demo so the presentation never waits on a download:
    python scripts/download_models.py            # all four models
    python scripts/download_models.py --skip vqa base
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.services.model_manager import MODEL_SPECS  # noqa: E402
from transformers import BlipProcessor  # noqa: E402

SHORT = {"large": "caption-large", "base": "caption-base", "itm": "itm", "vqa": "vqa"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--skip", nargs="*", default=[], choices=list(SHORT), help="models to skip")
    args = parser.parse_args()

    skip = {SHORT[s] for s in args.skip}
    failures = 0
    for key, (attr, model_cls, label) in MODEL_SPECS.items():
        if key in skip:
            continue
        source = getattr(settings, attr)
        print(f"→ {label:<34} {source}")
        start = time.perf_counter()
        try:
            BlipProcessor.from_pretrained(source)
            model_cls.from_pretrained(source)
        except Exception as exc:  # keep going so one failure doesn't block the rest
            failures += 1
            print(f"  ✗ failed: {exc}\n    If huggingface.co is blocked on this network, use scripts/convert_original_blip.py")
            continue
        print(f"  ✓ ready ({time.perf_counter() - start:.0f}s)")
    print("All models are cached. Start the app with:  python run.py" if not failures else f"{failures} model(s) failed.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
