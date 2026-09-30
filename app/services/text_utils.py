"""Caption post-processing: cleanup, formatting, keywords and hashtags."""

from __future__ import annotations

import re

# BLIP-large sometimes emits nonsense tokens learned from noisy web alt-text.
_ARTIFACTS = re.compile(r"\b(arafed|araffe|arafe|arafly|araffy|arrafed|araf)\b\s*", re.IGNORECASE)
_LEADING_FILLER = re.compile(r"^(there is|there are|this is|it is)\s+", re.IGNORECASE)
_REPEATED_WORD = re.compile(r"\b(\w+)(\s+\1\b)+", re.IGNORECASE)
_X_AND_X = re.compile(r"\b(\w+) (and|with) \1\b", re.IGNORECASE)  # "lava and lava" -> "lava"
_SPACE_BEFORE_PUNCT = re.compile(r"\s+([,.!?;:'])")

STOPWORDS = frozenset(
    """
    a an the and or but of on in into onto at to from by for with without over under near next
    up down out off above below behind front top bottom side while there here this that these those
    it its is are was were be been being has have had do does did some any each other another
    his her their our your my him them they he she we you i me who whom which what where when
    very small large big little many few several two three four five one six seven eight nine ten
    picture image photo photograph photography view shot close closeup background foreground
    stands standing sits sitting lays laying lying looking holds holding walks walking
    around across through along against between
    """.split()
)


def clean_caption(text: str, prompt: str = "") -> str:
    """Strip the conditioning prompt, known artefacts and repeated words."""
    text = text.strip()
    if prompt:
        p = prompt.strip().lower()
        if text.lower().startswith(p):
            text = text[len(p) :].strip()
    text = _ARTIFACTS.sub("", text)
    text = _LEADING_FILLER.sub("", text)
    text = _REPEATED_WORD.sub(r"\1", text)
    text = _X_AND_X.sub(r"\1", text)
    text = _SPACE_BEFORE_PUNCT.sub(r"\1", text)
    text = re.sub(r"\s+", " ", text).strip(" ,.")
    return text


def to_sentence(text: str) -> str:
    """'a dog on a beach' -> 'A dog on a beach.'"""
    text = text.strip()
    if not text:
        return text
    text = text[0].upper() + text[1:]
    if text[-1] not in ".!?":
        text += "."
    return text


def keywords(text: str, limit: int = 8) -> list[str]:
    seen: list[str] = []
    for word in re.findall(r"[a-zA-Z][a-zA-Z\-]+", text.lower()):
        if word in STOPWORDS or len(word) < 3 or word in seen:
            continue
        seen.append(word)
    return seen[:limit]


def hashtags(words: list[str], limit: int = 6) -> list[str]:
    return ["#" + w.replace("-", "") for w in words[:limit]]


def alt_text(caption: str) -> str:
    return f'<img src="image.jpg" alt="{to_sentence(caption)}">'


def format_outputs(caption: str) -> dict:
    kw = keywords(caption)
    return {
        "sentence": to_sentence(caption),
        "keywords": kw,
        "hashtags": hashtags(kw),
        "alt_text": alt_text(caption),
        "word_count": len(caption.split()),
    }
