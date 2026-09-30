"""Caption generation with BLIP.

Pipeline for one image:
  1. Encode the image once with the Vision Transformer (ViT).
  2. Decode several candidate captions from the same image embedding
     (beam search for accuracy, nucleus sampling for variety).
  3. Score every candidate with a single teacher-forced pass of the decoder
     -> per-token probabilities -> a language-model confidence.
  4. Optionally re-rank candidates with the BLIP image-text matching (ITM) head,
     which independently checks how well each sentence fits the picture.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass

import torch
from PIL import Image

from app.services import text_utils
from app.services.matcher import Matcher
from app.services.model_manager import LoadedModel, ModelManager

# The original BLIP captioner was fine-tuned with this prefix. Conditioning on it gives
# noticeably cleaner captions than unconditional decoding (which is where BLIP-large's
# infamous "arafed ..." captions come from). It is stripped from the output.
DEFAULT_PROMPT = "a picture of"

# beam = "Balanced" (default), hybrid = "Detailed", sampling = "Creative" — see docs/EVALUATION.md
STRATEGIES = ("beam", "hybrid", "sampling")


@dataclass
class CaptionOptions:
    model: str = "large"  # "large" | "base"
    strategy: str = "beam"  # "beam" | "hybrid" | "sampling"
    num_candidates: int = 5
    max_new_tokens: int = 30
    min_new_tokens: int = 5
    num_beams: int = 5
    top_p: float = 0.9
    temperature: float = 0.9
    prompt: str = ""
    rerank: bool = True

    def normalized(self) -> "CaptionOptions":
        self.model = self.model if self.model in ("large", "base") else "large"
        self.strategy = self.strategy if self.strategy in STRATEGIES else "beam"
        self.num_candidates = max(1, min(int(self.num_candidates), 8))
        self.max_new_tokens = max(8, min(int(self.max_new_tokens), 60))
        self.min_new_tokens = max(1, min(int(self.min_new_tokens), self.max_new_tokens - 1))
        self.num_beams = max(self.num_candidates, min(int(self.num_beams), 10))
        self.top_p = max(0.1, min(float(self.top_p), 1.0))
        self.temperature = max(0.1, min(float(self.temperature), 2.0))
        self.prompt = " ".join(self.prompt.strip().lower().split())[:80]
        return self

    def cache_key(self) -> tuple:
        return (self.model, self.strategy, self.num_candidates, self.max_new_tokens, self.min_new_tokens,
                self.num_beams, self.top_p, self.temperature, self.prompt, self.rerank)


class Captioner:
    def __init__(self, manager: ModelManager, matcher: Matcher):
        self.manager = manager
        self.matcher = matcher

    def caption(self, image: Image.Image, opts: CaptionOptions) -> dict:
        opts = opts.normalized()
        lm = self.manager.get(f"caption-{opts.model}")
        prompt = opts.prompt or DEFAULT_PROMPT
        timings: dict[str, float] = {}
        start = time.perf_counter()

        with lm.lock, torch.inference_mode():
            image_embeds, prompt_ids, prompt_mask = self._encode(lm, image, prompt)
            timings["vision_ms"] = _ms(start)

            t = time.perf_counter()
            sequences = self._decode(lm, image_embeds, prompt_ids, prompt_mask, opts)
            timings["decode_ms"] = _ms(t)

            t = time.perf_counter()
            candidates = self._score(lm, image_embeds, sequences, prompt_ids.shape[1], prompt, opts)
            timings["scoring_ms"] = _ms(t)

        if not candidates:
            raise RuntimeError("The model could not produce a caption for this image.")

        reranked = False
        if opts.rerank and len(candidates) > 1 and self.manager.is_enabled("itm"):
            t = time.perf_counter()
            scores = self.matcher.score(image, [c["text"] for c in candidates])
            for cand, s in zip(candidates, scores):
                cand["match"] = s["match"]
                cand["similarity"] = s["similarity"]
                # Blend "does it fit the picture?" (ITM) with "is it fluent?" (LM confidence)
                cand["score"] = round(0.65 * s["match"] + 0.35 * cand["confidence"], 4)
            timings["rerank_ms"] = _ms(t)
            reranked = True
        else:
            for cand in candidates:
                cand["score"] = cand["confidence"]

        candidates.sort(key=lambda c: c["score"], reverse=True)
        candidates = candidates[: opts.num_candidates]
        best = candidates[0]
        timings["total_ms"] = _ms(start)

        return {
            "caption": best["text"],
            **text_utils.format_outputs(best["text"]),
            "confidence": best["confidence"],
            "match": best.get("match"),
            "word_confidence": best.pop("tokens"),
            "candidates": [{k: v for k, v in c.items() if k != "tokens"} for c in candidates],
            "reranked": reranked,
            "model": opts.model,
            "strategy": opts.strategy,
            "prompt": opts.prompt,
            "timings": timings,
        }

    # ------------------------------------------------------------------ internals

    def _encode(self, lm: LoadedModel, image: Image.Image, prompt: str):
        model, device, dtype = lm.model, self.manager.device, self.manager.dtype
        inputs = lm.processor(images=image, text=prompt, return_tensors="pt")
        pixel_values = inputs["pixel_values"].to(device, dtype)
        image_embeds = model.vision_model(pixel_values=pixel_values)[0]

        # Same preparation as BlipForConditionalGeneration.generate: [DEC] replaces [CLS],
        # and the trailing [SEP] is dropped so decoding continues the prompt.
        input_ids = inputs["input_ids"].to(device)
        input_ids[:, 0] = model.config.text_config.bos_token_id
        return image_embeds, input_ids[:, :-1], inputs["attention_mask"].to(device)[:, :-1]

    def _generate(self, lm: LoadedModel, image_embeds, input_ids, attention_mask, **kwargs) -> torch.Tensor:
        cfg = lm.model.config.text_config
        image_mask = torch.ones(image_embeds.shape[:-1], dtype=torch.long, device=image_embeds.device)
        return lm.model.text_decoder.generate(
            input_ids=input_ids,
            attention_mask=attention_mask,
            encoder_hidden_states=image_embeds,
            encoder_attention_mask=image_mask,
            eos_token_id=cfg.sep_token_id,
            pad_token_id=cfg.pad_token_id,
            **kwargs,
        )

    def _decode(self, lm, image_embeds, input_ids, attention_mask, opts: CaptionOptions) -> list[torch.Tensor]:
        common = dict(max_new_tokens=opts.max_new_tokens, min_new_tokens=opts.min_new_tokens)
        n = opts.num_candidates
        # Hybrid mode asks for a few extra candidates because duplicates are removed later.
        n_beam = n if opts.strategy == "beam" else math.ceil(n / 2) + 1
        n_sample = n if opts.strategy == "sampling" else math.ceil(n / 2) + 1

        outputs = []
        if opts.strategy in ("beam", "hybrid"):
            outputs.append(self._generate(
                lm, image_embeds, input_ids, attention_mask,
                num_beams=max(opts.num_beams, n_beam), num_return_sequences=n_beam,
                repetition_penalty=1.1, no_repeat_ngram_size=3, length_penalty=1.0, early_stopping=True,
                **common,
            ))
        if opts.strategy in ("sampling", "hybrid"):
            outputs.append(self._generate(
                lm, image_embeds, input_ids, attention_mask,
                do_sample=True, top_p=opts.top_p, top_k=0, temperature=opts.temperature,
                num_return_sequences=n_sample, repetition_penalty=1.1, no_repeat_ngram_size=3,
                **common,
            ))
        return [row for out in outputs for row in out]

    def _score(self, lm, image_embeds, sequences, prompt_len: int, prompt: str, opts) -> list[dict]:
        """Deduplicate candidates and compute token probabilities with one batched forward pass."""
        tokenizer = lm.processor.tokenizer
        cfg = lm.model.config.text_config
        keep_prompt = bool(opts.prompt)  # a user prompt is part of the sentence, the default one is not

        unique: dict[str, torch.Tensor] = {}
        sources: dict[str, str] = {}
        n_beam_rows = len(sequences) if opts.strategy == "beam" else (
            0 if opts.strategy == "sampling" else math.ceil(opts.num_candidates / 2) + 1)
        for i, seq in enumerate(sequences):
            raw = tokenizer.decode(seq, skip_special_tokens=True)
            text = text_utils.clean_caption(raw, "" if keep_prompt else prompt)
            key = text.lower()
            if len(text.split()) < 2 or key in unique:
                continue
            unique[key] = seq
            sources[key] = "beam" if i < n_beam_rows else "sampling"
        if not unique:
            return []

        batch = torch.nn.utils.rnn.pad_sequence(list(unique.values()), batch_first=True, padding_value=cfg.pad_token_id)
        attention = (batch != cfg.pad_token_id).long()
        attention[:, :prompt_len] = 1
        embeds = image_embeds.expand(batch.shape[0], -1, -1)
        image_mask = torch.ones(embeds.shape[:-1], dtype=torch.long, device=embeds.device)
        logits = lm.model.text_decoder(
            input_ids=batch, attention_mask=attention,
            encoder_hidden_states=embeds, encoder_attention_mask=image_mask,
        ).logits.float()
        log_probs = torch.log_softmax(logits[:, :-1], dim=-1).gather(-1, batch[:, 1:].unsqueeze(-1)).squeeze(-1)

        candidates = []
        for row, (key, seq) in enumerate(unique.items()):
            gen_ids = batch[row, prompt_len:].tolist()
            gen_lp = log_probs[row, prompt_len - 1 :].tolist()
            tokens, lps = [], []
            for tok_id, lp in zip(gen_ids, gen_lp):
                if tok_id == cfg.pad_token_id:
                    break
                lps.append(lp)
                if tok_id == cfg.sep_token_id:
                    break
                tokens.append((tokenizer.convert_ids_to_tokens(tok_id), math.exp(lp)))
            mean_lp = sum(lps) / max(len(lps), 1)
            text = text_utils.clean_caption(tokenizer.decode(seq, skip_special_tokens=True),
                                            "" if keep_prompt else prompt)
            candidates.append({
                "text": text,
                "confidence": round(math.exp(mean_lp), 4),
                "perplexity": round(math.exp(-mean_lp), 3),
                "source": sources[key],
                "tokens": _align_to_caption(_merge_wordpieces(tokens), text),
            })
        return candidates


def _align_to_caption(words: list[dict], caption: str) -> list[dict]:
    """Drop leading words that clean_caption removed (e.g. 'there is') so bars match the shown text."""
    target = caption.lower().split()
    while words and target and len(words) > len(target) and words[0]["word"] != target[0]:
        words = words[1:]
    return words


def _merge_wordpieces(tokens: list[tuple[str, float]]) -> list[dict]:
    """Join BERT word pieces ('sky', '##scraper') into words; a word's probability is the product."""
    words: list[dict] = []
    for tok, p in tokens:
        if tok.startswith("##") and words:
            words[-1]["word"] += tok[2:]
            words[-1]["p"] *= p
        else:
            words.append({"word": tok, "p": p})
    artefacts = {"arafed", "araffe", "arafe", "arafly", "araffy", "arrafed", "araf"}
    return [{"word": w["word"], "p": round(w["p"], 4)} for w in words if w["word"] not in artefacts]


def _ms(start: float) -> float:
    return round((time.perf_counter() - start) * 1000, 1)
