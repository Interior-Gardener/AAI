"""Lazy, thread-safe loading of the BLIP models used by the app.

Every model is loaded at most once and then shared. Inference is guarded by locks so two
requests never fight over the same CPU cores (on CPU all models share one lock; on a GPU
each model has its own).
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field

import torch
from transformers import (
    BlipForConditionalGeneration,
    BlipForImageTextRetrieval,
    BlipForQuestionAnswering,
    BlipProcessor,
)

from app.config import Settings

log = logging.getLogger(__name__)

MODEL_SPECS = {
    # key: (settings attribute, model class, human readable label)
    "caption-large": ("caption_model_large", BlipForConditionalGeneration, "BLIP Large · ViT-L/16"),
    "caption-base": ("caption_model_base", BlipForConditionalGeneration, "BLIP Base · ViT-B/16"),
    "itm": ("itm_model", BlipForImageTextRetrieval, "BLIP ITM · image-text matching"),
    "vqa": ("vqa_model", BlipForQuestionAnswering, "BLIP VQA · question answering"),
}


@dataclass
class LoadedModel:
    key: str
    processor: BlipProcessor
    model: torch.nn.Module
    lock: threading.RLock = field(default_factory=threading.RLock)
    load_seconds: float = 0.0
    parameters: int = 0


def pick_device(preference: str) -> torch.device:
    pref = preference.lower()
    if pref != "auto":
        return torch.device(pref)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


class ModelManager:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.device = pick_device(settings.device)
        # Half precision halves memory and doubles speed on GPUs; CPUs stay in float32.
        self.dtype = torch.float16 if self.device.type == "cuda" else torch.float32
        if self.device.type == "cpu":
            # PyTorch's CPU kernels spin-wait on every thread. If the browser (or anything else) is busy on
            # one core, a thread per core stalls the whole pool — we measured 10x slowdowns. Leave one core free.
            threads = settings.torch_threads or max(1, torch.get_num_threads() - 1)
            torch.set_num_threads(threads)
            # For the same reason, CPU inference runs one model at a time; GPUs can overlap requests.
            self._shared_lock: threading.RLock | None = threading.RLock()
        else:
            if settings.torch_threads > 0:
                torch.set_num_threads(settings.torch_threads)
            self._shared_lock = None
        self._models: dict[str, LoadedModel] = {}
        self._errors: dict[str, str] = {}
        self._loading: set[str] = set()
        self._load_locks = {key: threading.Lock() for key in MODEL_SPECS}

    def source(self, key: str) -> str:
        return getattr(self.settings, MODEL_SPECS[key][0])

    def is_enabled(self, key: str) -> bool:
        if key == "itm":
            return self.settings.enable_itm
        if key == "vqa":
            return self.settings.enable_vqa
        return True

    def get(self, key: str) -> LoadedModel:
        if key not in MODEL_SPECS:
            raise KeyError(f"Unknown model '{key}'")
        if not self.is_enabled(key):
            raise RuntimeError(f"The '{key}' model is disabled in the settings.")
        loaded = self._models.get(key)
        if loaded is not None:
            return loaded
        with self._load_locks[key]:
            if key not in self._models:  # another thread may have finished loading meanwhile
                self._models[key] = self._load(key)
        return self._models[key]

    def _load(self, key: str) -> LoadedModel:
        attr, model_cls, _ = MODEL_SPECS[key]
        source = getattr(self.settings, attr)
        log.info("Loading %s from %s on %s ...", key, source, self.device)
        self._loading.add(key)
        start = time.perf_counter()
        try:
            processor = BlipProcessor.from_pretrained(source, use_fast=False)
            kwargs = {"dtype": self.dtype}
            if key == "itm":
                kwargs["attn_implementation"] = "eager"  # Grad-CAM needs explicit attention maps
            model = model_cls.from_pretrained(source, **kwargs).to(self.device).eval()
        except Exception as exc:
            self._errors[key] = str(exc)
            log.exception("Failed to load %s", key)
            raise
        finally:
            self._loading.discard(key)
        self._errors.pop(key, None)
        elapsed = time.perf_counter() - start
        params = sum(p.numel() for p in model.parameters())
        log.info("Loaded %s (%.0fM params) in %.1fs", key, params / 1e6, elapsed)
        lock = self._shared_lock or threading.RLock()
        return LoadedModel(key, processor, model, lock=lock, load_seconds=elapsed, parameters=params)

    def preload(self, keys: list[str]) -> None:
        for key in keys:
            if self.is_enabled(key):
                try:
                    self.get(key)
                except Exception:  # keep the server alive; status endpoint reports the error
                    pass

    def status(self) -> dict:
        models = {}
        for key, (_, _, label) in MODEL_SPECS.items():
            loaded = self._models.get(key)
            if not self.is_enabled(key):
                state = "disabled"
            elif loaded:
                state = "ready"
            elif key in self._loading:
                state = "loading"
            elif key in self._errors:
                state = "error"
            else:
                state = "idle"
            models[key] = {
                "label": label,
                "source": self.source(key),
                "state": state,
                "parameters_m": round(loaded.parameters / 1e6, 1) if loaded else None,
                "load_seconds": round(loaded.load_seconds, 1) if loaded else None,
                "error": self._errors.get(key),
            }
        return {
            "device": self.device.type,
            "dtype": str(self.dtype).replace("torch.", ""),
            "threads": torch.get_num_threads(),
            "models": models,
        }
