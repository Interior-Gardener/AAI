"""Image-text matching (ITM) and visual grounding with BLIP's retrieval model.

* `score` answers "how well does this sentence describe this image?" in two ways:
    - match:      probability from the ITM head (text attends to image patches)
    - similarity: cosine similarity of the contrastive (ITC) image/text embeddings
* `ground` explains a caption word by word with Grad-CAM on the cross-attention
  layer, showing which image regions each word relied on.
"""

from __future__ import annotations

import time

import torch
from PIL import Image

from app.services import text_utils
from app.services.model_manager import ModelManager

GRADCAM_LAYER = 8  # the layer used by the BLIP authors for their grounding visualisations


class Matcher:
    def __init__(self, manager: ModelManager):
        self.manager = manager

    def _pixels(self, lm, image: Image.Image) -> torch.Tensor:
        pixels = lm.processor(images=image, return_tensors="pt")["pixel_values"]
        return pixels.to(self.manager.device, self.manager.dtype)

    def score(self, image: Image.Image, texts: list[str]) -> list[dict]:
        texts = [t.strip() for t in texts if t and t.strip()]
        if not texts:
            return []
        lm = self.manager.get("itm")
        model, device = lm.model, self.manager.device
        with lm.lock, torch.inference_mode():
            image_embeds = model.vision_model(pixel_values=self._pixels(lm, image))[0]
            tok = lm.processor.tokenizer(texts, padding=True, truncation=True, max_length=64, return_tensors="pt").to(device)
            n = len(texts)
            embeds = image_embeds.expand(n, -1, -1)
            image_mask = torch.ones(embeds.shape[:-1], dtype=torch.long, device=device)

            fused = model.text_encoder(
                input_ids=tok.input_ids, attention_mask=tok.attention_mask,
                encoder_hidden_states=embeds, encoder_attention_mask=image_mask,
            ).last_hidden_state
            match = torch.softmax(model.itm_head(fused[:, 0, :]).float(), dim=-1)[:, 1]

            text_only = model.text_encoder(input_ids=tok.input_ids, attention_mask=tok.attention_mask).last_hidden_state
            img_feat = torch.nn.functional.normalize(model.vision_proj(image_embeds[:, 0, :]).float(), dim=-1)
            txt_feat = torch.nn.functional.normalize(model.text_proj(text_only[:, 0, :]).float(), dim=-1)
            similarity = (txt_feat @ img_feat.t()).squeeze(-1)

        return [
            {"text": t, "match": round(float(m), 4), "similarity": round(float(s), 4)}
            for t, m, s in zip(texts, match.tolist(), similarity.tolist())
        ]

    def ground(self, image: Image.Image, text: str) -> dict:
        """Word-level Grad-CAM heatmaps (one grid per word) for `text` on `image`."""
        text = text.strip()
        if not text:
            raise ValueError("Nothing to explain: the text is empty.")
        lm = self.manager.get("itm")
        model, device = lm.model, self.manager.device
        start = time.perf_counter()

        with lm.lock, torch.enable_grad():
            image_embeds = model.vision_model(pixel_values=self._pixels(lm, image))[0].detach()
            tok = lm.processor.tokenizer([text], truncation=True, max_length=64, return_tensors="pt").to(device)
            image_mask = torch.ones(image_embeds.shape[:-1], dtype=torch.long, device=device)
            out = model.text_encoder(
                input_ids=tok.input_ids, attention_mask=tok.attention_mask,
                encoder_hidden_states=image_embeds, encoder_attention_mask=image_mask,
                output_attentions=True, return_dict=True,
            )
            cross = out.cross_attentions[GRADCAM_LAYER]  # (1, heads, tokens, 1 + patches)
            logit = model.itm_head(out.last_hidden_state[:, 0, :])[:, 1].sum()
            grads = torch.autograd.grad(logit, cross)[0]

        grid = int(round((cross.shape[-1] - 1) ** 0.5))
        cam = (cross.detach().float() * grads.float().clamp(min=0)).mean(dim=1)[0, :, 1:]  # (tokens, patches)
        cam = _smooth(cam.reshape(-1, grid, grid).cpu())

        tokens = lm.processor.tokenizer.convert_ids_to_tokens(tok.input_ids[0].tolist())
        words = _group_words(tokens, cam)
        overall = torch.stack([w["map"] for w in words if not w["stopword"]] or [w["map"] for w in words]).mean(0)

        return {
            "text": text,
            "grid": grid,
            "overall": _normalize(overall),
            "words": [{"word": w["word"], "stopword": w["stopword"], "map": _normalize(w["map"])} for w in words],
            "elapsed_ms": round((time.perf_counter() - start) * 1000, 1),
        }


def _group_words(tokens: list[str], cam: torch.Tensor) -> list[dict]:
    words: list[dict] = []
    for i, tok in enumerate(tokens):
        if tok in ("[CLS]", "[SEP]", "[PAD]", "[ENC]", "[DEC]"):
            continue
        if tok.startswith("##") and words:
            words[-1]["word"] += tok[2:]
            words[-1]["parts"].append(cam[i])
        else:
            words.append({"word": tok, "parts": [cam[i]]})
    for w in words:
        w["map"] = torch.stack(w.pop("parts")).mean(0)
        w["stopword"] = w["word"] in text_utils.STOPWORDS or not w["word"].isalpha()
    return words


def _smooth(maps: torch.Tensor, sigma: float = 1.0) -> torch.Tensor:
    """Gaussian-blur each patch map (as BLIP's own visualisation does): raw Grad-CAM is peaky,
    often just 2–3 patches, which reads as noise. Blurring shows the region, not single pixels."""
    radius = 2
    x = torch.arange(-radius, radius + 1, dtype=torch.float32)
    k1 = torch.exp(-(x**2) / (2 * sigma**2))
    kernel = (k1[:, None] * k1[None, :]) / (k1.sum() ** 2)
    out = torch.nn.functional.conv2d(maps[:, None], kernel[None, None], padding=radius)
    return out[:, 0]


def _normalize(grid: torch.Tensor, gamma: float = 0.6) -> list[list[float]]:
    grid = grid.clamp(min=0)
    grid = grid - grid.min()
    peak = float(grid.max())
    if peak > 0:
        grid = (grid / peak) ** gamma  # gamma < 1 lifts weaker-but-relevant regions
    return [[round(float(v), 3) for v in row] for row in grid]
