"""Application settings, read once from environment variables (or a local .env file)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    """Minimal .env support so students don't need an extra dependency."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


_load_dotenv(ROOT_DIR / ".env")


@dataclass(frozen=True)
class Settings:
    # Model sources: a Hugging Face Hub id or a local folder (see scripts/convert_original_blip.py)
    caption_model_large: str = os.getenv("CAPTION_MODEL_LARGE", "Salesforce/blip-image-captioning-large")
    caption_model_base: str = os.getenv("CAPTION_MODEL_BASE", "Salesforce/blip-image-captioning-base")
    itm_model: str = os.getenv("ITM_MODEL", "Salesforce/blip-itm-base-coco")
    vqa_model: str = os.getenv("VQA_MODEL", "Salesforce/blip-vqa-base")

    default_caption_model: str = os.getenv("DEFAULT_CAPTION_MODEL", "large")
    device: str = os.getenv("DEVICE", "auto")  # auto | cpu | cuda | mps
    preload: bool = _env_bool("PRELOAD_MODELS", True)
    enable_itm: bool = _env_bool("ENABLE_ITM", True)
    enable_vqa: bool = _env_bool("ENABLE_VQA", True)
    torch_threads: int = int(os.getenv("TORCH_THREADS", "0"))  # 0 = let torch decide

    host: str = os.getenv("HOST", "127.0.0.1")
    port: int = int(os.getenv("PORT", "8000"))
    max_upload_mb: int = int(os.getenv("MAX_UPLOAD_MB", "15"))
    max_batch_files: int = int(os.getenv("MAX_BATCH_FILES", "12"))
    cache_size: int = int(os.getenv("RESULT_CACHE_SIZE", "64"))
    url_fetch_timeout: float = float(os.getenv("URL_FETCH_TIMEOUT", "12"))

    static_dir: Path = field(default=ROOT_DIR / "static")
    samples_dir: Path = field(default=ROOT_DIR / "sample_images")

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


settings = Settings()
