"""Standard image-captioning metrics, implemented from their papers with no extra dependencies.

* BLEU-1..4  (Papineni et al., 2002) — corpus-level n-gram precision with brevity penalty
* ROUGE-L    (Lin, 2004)             — longest-common-subsequence F-score, β = 1.2 as in COCO
* CIDEr-D    (Vedantam et al., 2015) — TF-IDF weighted n-gram similarity, the main COCO metric

Inputs are dicts mapping an image id to a list of strings (one hypothesis, several references).
"""

from __future__ import annotations

import math
import re
from collections import Counter

_TOKEN = re.compile(r"[a-z0-9']+")


def tokenize(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


def ngrams(tokens: list[str], n: int) -> Counter:
    return Counter(tuple(tokens[i : i + n]) for i in range(len(tokens) - n + 1))


# ------------------------------------------------------------------ BLEU


def bleu(hyps: dict[str, str], refs: dict[str, list[str]], max_n: int = 4) -> list[float]:
    """Corpus BLEU-1..max_n (same aggregation as the COCO caption toolkit)."""
    matches = [0] * max_n
    totals = [0] * max_n
    hyp_len = ref_len = 0
    for key, hyp in hyps.items():
        h = tokenize(hyp)
        rs = [tokenize(r) for r in refs[key]]
        hyp_len += len(h)
        ref_len += min((abs(len(r) - len(h)), len(r)) for r in rs)[1]  # closest reference length
        for n in range(1, max_n + 1):
            h_counts = ngrams(h, n)
            max_ref = Counter()
            for r in rs:
                max_ref |= ngrams(r, n)
            matches[n - 1] += sum(min(c, max_ref[g]) for g, c in h_counts.items())
            totals[n - 1] += max(len(h) - n + 1, 0)

    bp = 1.0 if hyp_len > ref_len else math.exp(1 - ref_len / max(hyp_len, 1))
    scores, log_sum = [], 0.0
    for n in range(max_n):
        p = matches[n] / totals[n] if totals[n] else 0.0
        log_sum += math.log(p) if p > 0 else -1e9
        scores.append(bp * math.exp(log_sum / (n + 1)))
    return scores


# ------------------------------------------------------------------ ROUGE-L


def _lcs(a: list[str], b: list[str]) -> int:
    prev = [0] * (len(b) + 1)
    for x in a:
        cur = [0]
        for j, y in enumerate(b):
            cur.append(prev[j] + 1 if x == y else max(prev[j + 1], cur[j]))
        prev = cur
    return prev[-1]


def rouge_l(hyps: dict[str, str], refs: dict[str, list[str]], beta: float = 1.2) -> float:
    scores = []
    for key, hyp in hyps.items():
        h = tokenize(hyp)
        precs, recs = [], []
        for r in refs[key]:
            r = tokenize(r)
            lcs = _lcs(h, r)
            precs.append(lcs / len(h) if h else 0.0)
            recs.append(lcs / len(r) if r else 0.0)
        p, r = max(precs), max(recs)
        scores.append(((1 + beta**2) * p * r) / (r + beta**2 * p) if p and r else 0.0)
    return sum(scores) / len(scores)


# ------------------------------------------------------------------ CIDEr-D


def cider_d(hyps: dict[str, str], refs: dict[str, list[str]], n_max: int = 4, sigma: float = 6.0) -> float:
    keys = list(hyps)
    ref_grams = {k: [[ngrams(tokenize(r), n) for n in range(1, n_max + 1)] for r in refs[k]] for k in keys}
    hyp_grams = {k: [ngrams(tokenize(hyps[k]), n) for n in range(1, n_max + 1)] for k in keys}

    # document frequency: in how many images' reference sets does each n-gram appear?
    df: Counter = Counter()
    for k in keys:
        seen = set()
        for per_ref in ref_grams[k]:
            for counts in per_ref:
                seen.update(counts)
        df.update(seen)
    log_n = math.log(float(len(keys)))

    def vec(grams: list[Counter]):
        v, norms = [], []
        for counts in grams:
            weights = {g: tf * (log_n - math.log(max(1.0, df[g]))) for g, tf in counts.items()}
            v.append(weights)
            norms.append(math.sqrt(sum(w * w for w in weights.values())))
        return v, norms

    total = 0.0
    for k in keys:
        hv, hn = vec(hyp_grams[k])
        h_len = len(tokenize(hyps[k]))
        score = [0.0] * n_max
        for per_ref in ref_grams[k]:
            rv, rn = vec(per_ref)
            r_len = sum(per_ref[0].values())
            delta = h_len - r_len
            for n in range(n_max):
                dot = sum(min(w, rv[n].get(g, 0.0)) * rv[n].get(g, 0.0) for g, w in hv[n].items())  # clipped
                if hn[n] and rn[n]:
                    score[n] += dot / (hn[n] * rn[n]) * math.exp(-(delta**2) / (2 * sigma**2))
        total += (sum(score) / n_max) / len(ref_grams[k]) * 10.0
    return total / len(keys)


def evaluate_all(hyps: dict[str, str], refs: dict[str, list[str]]) -> dict[str, float]:
    b = bleu(hyps, refs)
    return {
        "BLEU-1": b[0], "BLEU-2": b[1], "BLEU-3": b[2], "BLEU-4": b[3],
        "ROUGE-L": rouge_l(hyps, refs),
        "CIDEr-D": cider_d(hyps, refs),
    }
