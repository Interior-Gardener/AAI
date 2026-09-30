"""Visual Question Answering: ask BLIP anything about the uploaded image."""

from __future__ import annotations

import math
import time

import torch
from PIL import Image

from app.services.model_manager import ModelManager

MAX_QUESTION_CHARS = 200


class QuestionAnswerer:
    def __init__(self, manager: ModelManager):
        self.manager = manager

    def answer(self, image: Image.Image, question: str) -> dict:
        question = " ".join(question.strip().split())[:MAX_QUESTION_CHARS]
        if not question:
            raise ValueError("Please type a question.")
        if not question.endswith("?"):
            question += "?"

        lm = self.manager.get("vqa")
        start = time.perf_counter()
        with lm.lock, torch.inference_mode():
            inputs = lm.processor(images=image, text=question, return_tensors="pt").to(self.manager.device)
            inputs["pixel_values"] = inputs["pixel_values"].to(self.manager.dtype)
            out = lm.model.generate(
                **inputs, num_beams=3, max_new_tokens=12,
                output_scores=True, return_dict_in_generate=True,
            )
        answer = lm.processor.decode(out.sequences[0], skip_special_tokens=True).strip()
        confidence = None
        if getattr(out, "sequences_scores", None) is not None:
            confidence = round(math.exp(float(out.sequences_scores[0])), 4)

        return {
            "question": question,
            "answer": answer or "I'm not sure.",
            "confidence": confidence,
            "elapsed_ms": round((time.perf_counter() - start) * 1000, 1),
        }
