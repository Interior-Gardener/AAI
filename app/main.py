"""FastAPI application: REST API + the single-page web interface."""

from __future__ import annotations

import logging
import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.config import settings
from app.schemas import ExplainRequest, MatchRequest, VQARequest
from app.services.captioner import CaptionOptions, Captioner
from app.services.image_utils import ImageError, LoadedImage, color_palette, fetch_image_bytes, image_metadata, load_image
from app.services.matcher import Matcher
from app.services.model_manager import ModelManager
from app.services.store import LRUCache
from app.services.vqa import QuestionAnswerer

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s %(name)s: %(message)s")
log = logging.getLogger("app")

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

manager = ModelManager(settings)
matcher = Matcher(manager)
captioner = Captioner(manager, matcher)
answerer = QuestionAnswerer(manager)
images = LRUCache(32)  # image_id -> LoadedImage
results = LRUCache(settings.cache_size)  # (image_id, options) -> caption result
started_at = time.time()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.preload:
        # Load in the background so the web page is reachable immediately and can show progress.
        keys = [f"caption-{settings.default_caption_model}", "itm", "vqa"]
        threading.Thread(target=manager.preload, args=(keys,), daemon=True).start()
    yield


app = FastAPI(
    title="PixelProse · AI Image Caption Generator",
    version=__version__,
    description="Generate, explain and interrogate image captions with Salesforce BLIP.",
    lifespan=lifespan,
)
app.add_middleware(GZipMiddleware, minimum_size=1024)


# --------------------------------------------------------------------------- errors


@app.exception_handler(ImageError)
async def image_error_handler(_: Request, exc: ImageError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(OSError)
async def model_download_error_handler(_: Request, exc: OSError):
    # transformers raises OSError when a model can't be downloaded or found locally
    log.error("Model loading failed: %s", exc)
    return JSONResponse(
        status_code=503,
        content={"detail": "The AI model could not be loaded. Check your internet connection for the first "
                           "run, or see README → Offline setup."},
    )


# --------------------------------------------------------------------------- helpers


def _read_upload(file: UploadFile) -> bytes:
    data = file.file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise ImageError(f"Image is larger than {settings.max_upload_mb} MB.")
    return data


def _resolve_image(file: UploadFile | None, url: str | None, image_id: str | None) -> LoadedImage:
    if image_id:
        cached = images.get(image_id)
        if cached is None:
            raise HTTPException(404, "That image has expired from the server cache. Please upload it again.")
        return cached
    if file is not None and file.filename:
        data = _read_upload(file)
    elif url:
        data = fetch_image_bytes(url, settings.max_upload_bytes, settings.url_fetch_timeout)
    else:
        raise ImageError("Send an image file, an image URL or an image_id.")
    loaded = load_image(data, settings.max_upload_bytes)
    images.put(loaded.digest, loaded)
    return loaded


def _cached_image(image_id: str) -> LoadedImage:
    loaded = images.get(image_id)
    if loaded is None:
        raise HTTPException(404, "That image has expired from the server cache. Please upload it again.")
    return loaded


def _run(fn, *args):
    try:
        return fn(*args)
    except (ValueError, KeyError) as exc:
        raise HTTPException(400, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc


# --------------------------------------------------------------------------- API


@app.get("/api/health", tags=["system"])
def health():
    return {
        "status": "ok",
        "version": __version__,
        "uptime_s": round(time.time() - started_at),
        **manager.status(),
        "features": {"itm": settings.enable_itm, "vqa": settings.enable_vqa},
        "default_model": settings.default_caption_model,
        "preload": settings.preload,
        "cache": results.stats(),
        "limits": {"max_upload_mb": settings.max_upload_mb, "max_batch_files": settings.max_batch_files},
    }


@app.get("/api/samples", tags=["system"])
def samples():
    root = settings.samples_dir
    if not root.is_dir():
        return {"samples": []}
    items = []
    for path in sorted(root.rglob("*")):
        if path.suffix.lower() in IMAGE_EXTENSIONS:
            rel = path.relative_to(root).as_posix()
            items.append({
                "name": path.stem.replace("_", " "),
                "category": path.parent.name if path.parent != root else "misc",
                "url": f"/samples/{rel}",
            })
    return {"samples": items}


@app.post("/api/upload", tags=["captioning"])
def upload(file: UploadFile = File(...)):
    """Register an image without captioning it; returns an image_id for /api/vqa, /api/explain, /api/match."""
    loaded = _resolve_image(file, None, None)
    return {"image_id": loaded.digest, "metadata": image_metadata(loaded)}


@app.post("/api/caption", tags=["captioning"])
def caption(
    file: UploadFile | None = File(None, description="Image file (JPEG, PNG, WEBP, GIF, BMP)"),
    url: str | None = Form(None, description="Public image URL, used when no file is sent"),
    image_id: str | None = Form(None, description="Re-use an image uploaded earlier"),
    model: str = Form(settings.default_caption_model, description="large (accurate) or base (fast)"),
    strategy: str = Form("beam", description="beam (balanced) | hybrid (detailed) | sampling (creative)"),
    num_candidates: int = Form(5, ge=1, le=8),
    max_new_tokens: int = Form(30, ge=8, le=60),
    min_new_tokens: int = Form(5, ge=1, le=30),
    num_beams: int = Form(5, ge=1, le=10),
    top_p: float = Form(0.9, gt=0, le=1),
    temperature: float = Form(0.9, gt=0, le=2),
    prompt: str = Form("", description="Optional text the caption must start with, e.g. 'a painting of'"),
    rerank: bool = Form(True, description="Re-rank candidates with the image-text matching model"),
):
    loaded = _resolve_image(file, url, image_id)
    opts = CaptionOptions(
        model=model, strategy=strategy, num_candidates=num_candidates, max_new_tokens=max_new_tokens,
        min_new_tokens=min_new_tokens, num_beams=num_beams, top_p=top_p, temperature=temperature,
        prompt=prompt, rerank=rerank,
    ).normalized()

    key = (loaded.digest, opts.cache_key())
    result = results.get(key) if opts.strategy == "beam" else None  # sampling is random on purpose
    cached = result is not None
    if result is None:
        result = _run(captioner.caption, loaded.image, opts)
        results.put(key, result)

    return {
        "image_id": loaded.digest,
        "cached": cached,
        **result,
        "palette": color_palette(loaded.image),
        "metadata": image_metadata(loaded),
    }


@app.post("/api/explain", tags=["explainability"])
def explain(req: ExplainRequest):
    loaded = _cached_image(req.image_id)
    return _run(matcher.ground, loaded.image, req.text)


@app.post("/api/vqa", tags=["question answering"])
def vqa(req: VQARequest):
    loaded = _cached_image(req.image_id)
    return _run(answerer.answer, loaded.image, req.question)


@app.post("/api/match", tags=["image-text matching"])
def match(req: MatchRequest):
    loaded = _cached_image(req.image_id)
    scores = _run(matcher.score, loaded.image, req.texts)
    return {"results": sorted(scores, key=lambda s: s["match"], reverse=True)}


@app.post("/api/batch", tags=["captioning"])
def batch(
    files: list[UploadFile] = File(..., description="Several images at once"),
    model: str = Form(settings.default_caption_model),
    rerank: bool = Form(False),
):
    if len(files) > settings.max_batch_files:
        raise HTTPException(400, f"Please send at most {settings.max_batch_files} images per batch.")
    opts = CaptionOptions(model=model, strategy="beam", num_candidates=3, rerank=rerank).normalized()
    items = []
    for f in files:
        try:
            loaded = _resolve_image(f, None, None)
            key = (loaded.digest, opts.cache_key())
            result = results.get(key)
            if result is None:
                result = captioner.caption(loaded.image, opts)
                results.put(key, result)
            items.append({
                "filename": f.filename, "image_id": loaded.digest, "ok": True,
                "caption": result["caption"], "sentence": result["sentence"],
                "confidence": result["confidence"], "match": result["match"],
                "hashtags": result["hashtags"], "total_ms": result["timings"]["total_ms"],
            })
        except (ImageError, ValueError, RuntimeError) as exc:
            items.append({"filename": f.filename, "ok": False, "error": str(exc)})
    return {"items": items}


# --------------------------------------------------------------------------- web UI

app.mount("/static", StaticFiles(directory=settings.static_dir), name="static")
if settings.samples_dir.is_dir():
    app.mount("/samples", StaticFiles(directory=settings.samples_dir), name="samples")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(settings.static_dir / "index.html")


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return FileResponse(settings.static_dir / "assets" / "favicon.svg", media_type="image/svg+xml")
