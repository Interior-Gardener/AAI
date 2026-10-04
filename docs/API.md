# PixelProse REST API

Base URL: `http://127.0.0.1:8000`. Interactive docs (Swagger UI, served locally so they work offline) are at **`/docs`**.

| Method | Path | Body | Purpose |
|---|---|---|---|
| GET | `/api/health` | – | Server, device, per-model status, cache stats |
| GET | `/api/samples` | – | List of bundled sample images |
| POST | `/api/caption` | multipart | Caption an image (file, `url` or `image_id`) |
| POST | `/api/upload` | multipart | Register an image and get an `image_id` without captioning |
| POST | `/api/explain` | JSON | Word-level Grad-CAM heatmaps for a text |
| POST | `/api/vqa` | JSON | Answer a question about an image |
| POST | `/api/match` | JSON | Score up to 8 descriptions against an image |
| POST | `/api/batch` | multipart | Caption several files in one request |

Errors always look like `{"detail": "human readable message"}`, with status 400 (bad input), 404 (unknown/expired `image_id`), 422 (invalid parameter) or 503 (model unavailable).

## POST /api/caption

Form fields (all optional except one image source):

| Field | Default | Notes |
|---|---|---|
| `file` | – | Image file |
| `url` | – | Public http(s) image URL (used if no file) |
| `image_id` | – | Re-use an image uploaded earlier |
| `model` | `large` | `large` or `base` |
| `strategy` | `beam` | `beam` (Balanced), `hybrid` (Detailed) or `sampling` (Creative) |
| `num_candidates` | 5 | 1–8 |
| `max_new_tokens` / `min_new_tokens` | 30 / 5 | Caption length bounds |
| `num_beams` | 5 | 1–10 (raised to at least `num_candidates`) |
| `top_p` / `temperature` | 0.9 / 0.9 | Sampling controls |
| `prompt` | "" | Guided prefix, e.g. `a painting of` |
| `rerank` | true | Use the ITM model to pick the best candidate |

```bash
curl -F file=@sample_images/animals/zebra.jpg http://127.0.0.1:8000/api/caption
```

```json
{
  "image_id": "d83438dfe63503c79b17ed92974bdce707ad28fd",
  "cached": false,
  "caption": "a close up of a zebra near a rock",
  "sentence": "A close up of a zebra near a rock.",
  "confidence": 0.5726,
  "match": 0.9762,
  "keywords": ["zebra", "rock"],
  "hashtags": ["#zebra", "#rock"],
  "alt_text": "<img src=\"image.jpg\" alt=\"A close up of a zebra near a rock.\">",
  "word_confidence": [{"word": "a", "p": 0.7633}, "…"],
  "candidates": [{"text": "…", "confidence": 0.57, "match": 0.98, "similarity": 0.49, "score": 0.83, "source": "beam"}],
  "timings": {"vision_ms": 1160, "decode_ms": 1920, "scoring_ms": 540, "rerank_ms": 840, "total_ms": 4470},
  "palette": [{"hex": "#6f7466", "rgb": [111, 116, 102], "share": 0.31}],
  "metadata": {"width": 500, "height": 375, "format": "JPEG", "tone": "balanced", "…": "…"}
}
```

## POST /api/explain

```bash
curl -H "Content-Type: application/json" \
     -d '{"image_id": "<id>", "text": "a zebra near a rock"}' http://127.0.0.1:8000/api/explain
```

Returns `grid` (24), `overall` (24×24 floats in 0–1) and `words: [{word, stopword, map}]`.

## POST /api/vqa

```bash
curl -H "Content-Type: application/json" \
     -d '{"image_id": "<id>", "question": "what animal is this?"}' http://127.0.0.1:8000/api/vqa
# {"question": "what animal is this?", "answer": "zebra", "confidence": 0.93, "elapsed_ms": 520}
```

## POST /api/match

```bash
curl -H "Content-Type: application/json" \
     -d '{"image_id": "<id>", "texts": ["a zebra", "a horse", "a red car"]}' http://127.0.0.1:8000/api/match
```

Returns `results` sorted by `match` (ITM probability), each with `similarity` (ITC cosine).

## Python client example

```python
import requests

API = "http://127.0.0.1:8000"
with open("photo.jpg", "rb") as f:
    res = requests.post(f"{API}/api/caption", files={"file": f}, data={"model": "large"}).json()
print(res["sentence"], f"({res['match']:.0%} match)")

answer = requests.post(f"{API}/api/vqa", json={"image_id": res["image_id"], "question": "how many people are there?"}).json()
print(answer["answer"])
```
