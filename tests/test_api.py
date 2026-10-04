"""API tests with the neural networks replaced by fast fakes (no model download needed)."""

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import main


def fake_caption(image, opts):
    text = f"{opts.prompt} a test image".strip() if opts.prompt else "a test image of a red square"
    return {
        "caption": text, "sentence": text.capitalize() + ".", "keywords": ["test", "red", "square"],
        "hashtags": ["#test"], "alt_text": "", "word_count": len(text.split()), "confidence": 0.8, "match": 0.9,
        "word_confidence": [{"word": w, "p": 0.8} for w in text.split()],
        "candidates": [{"text": text, "confidence": 0.8, "match": 0.9, "score": 0.87, "source": "beam"}],
        "reranked": True, "model": opts.model, "strategy": opts.strategy, "prompt": opts.prompt,
        "timings": {"vision_ms": 1, "decode_ms": 1, "scoring_ms": 1, "total_ms": 3},
    }


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(main.captioner, "caption", fake_caption)
    monkeypatch.setattr(main.answerer, "answer", lambda img, q: {"question": q, "answer": "red", "confidence": 0.9, "elapsed_ms": 1})
    monkeypatch.setattr(main.matcher, "score", lambda img, texts: [{"text": t, "match": 0.5, "similarity": 0.3} for t in texts])
    monkeypatch.setattr(main.matcher, "ground", lambda img, text: {"text": text, "grid": 2, "overall": [[0, 1], [1, 0]], "words": [], "elapsed_ms": 1})
    main.results._data.clear()
    return TestClient(main.app)


def png_bytes(color="red", size=(32, 32)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "PNG")
    return buf.getvalue()


def upload(client, **fields):
    return client.post("/api/caption", files={"file": ("red.png", png_bytes(), "image/png")}, data=fields)


def test_index_and_static(client):
    assert client.get("/").status_code == 200
    assert "PixelProse" in client.get("/").text
    assert client.get("/static/js/main.js").status_code == 200


def test_api_docs_are_self_hosted(client):
    html = client.get("/docs").text
    assert "/static/vendor/swagger-ui/swagger-ui-bundle.js" in html
    assert client.get("/static/vendor/swagger-ui/swagger-ui-bundle.js").status_code == 200


def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert set(body["models"]) == {"caption-large", "caption-base", "itm", "vqa"}


def test_samples_listing(client):
    samples = client.get("/api/samples").json()["samples"]
    assert len(samples) >= 30
    assert all(s["url"].startswith("/samples/") for s in samples)


def test_caption_returns_everything_the_ui_needs(client):
    res = upload(client)
    assert res.status_code == 200
    body = res.json()
    for key in ("image_id", "caption", "sentence", "candidates", "palette", "metadata", "timings", "word_confidence"):
        assert key in body
    assert body["metadata"]["width"] == 32


def test_caption_reuses_image_id_and_caches_beam_results(client):
    first = upload(client, strategy="beam").json()
    second = client.post("/api/caption", data={"image_id": first["image_id"], "strategy": "beam"}).json()
    assert second["cached"] is True
    assert second["caption"] == first["caption"]


def test_guided_prompt_is_passed_through(client):
    body = upload(client, prompt="A Painting Of").json()
    assert body["caption"].startswith("a painting of")


def test_rejects_non_images_and_bad_params(client):
    res = client.post("/api/caption", files={"file": ("x.txt", b"hello", "text/plain")})
    assert res.status_code == 400
    assert client.post("/api/caption", data={}).status_code == 400
    assert upload(client, num_candidates=99).status_code == 422


def test_unknown_image_id_is_404(client):
    assert client.post("/api/vqa", json={"image_id": "deadbeefdeadbeef", "question": "what?"}).status_code == 404


def test_vqa_match_explain_flow(client):
    image_id = upload(client).json()["image_id"]
    assert client.post("/api/vqa", json={"image_id": image_id, "question": "what color?"}).json()["answer"] == "red"
    ranked = client.post("/api/match", json={"image_id": image_id, "texts": ["a", "b"]}).json()["results"]
    assert len(ranked) == 2
    assert client.post("/api/explain", json={"image_id": image_id, "text": "a red square"}).json()["grid"] == 2


def test_upload_endpoint(client):
    res = client.post("/api/upload", files={"file": ("red.png", png_bytes(), "image/png")})
    assert res.status_code == 200
    assert len(res.json()["image_id"]) == 40


def test_batch(client):
    files = [("files", (f"{c}.png", png_bytes(c), "image/png")) for c in ("red", "green")]
    files.append(("files", ("bad.txt", b"nope", "text/plain")))
    items = client.post("/api/batch", files=files).json()["items"]
    assert [i["ok"] for i in items] == [True, True, False]
