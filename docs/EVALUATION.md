# PixelProse — Evaluation

How good are the captions, and what does each part of the pipeline contribute? We measured it.

## Method

- **Test set:** the 44 bundled images in `sample_images/` (animals, people, food, vehicles, nature, art), all photos the models were never tuned on.
- **References:** 3 hand-written captions per image (132 in total), in `sample_images/references.json`.
- **Metrics** (implemented from their papers in `app/services/metrics.py`, unit-tested in `tests/`):
  - **BLEU-1/4**: n-gram precision with a brevity penalty (Papineni et al., 2002)
  - **ROUGE-L**: longest-common-subsequence F-score (Lin, 2004)
  - **CIDEr-D**: TF-IDF-weighted n-gram similarity, the primary COCO captioning metric (Vedantam et al., 2015)
  - **ITM match**: probability from BLIP's image-text matching head that the caption fits the image. It is reference-free, but note that the re-ranking configurations optimise this same model, so treat it as partly self-referential.
  - **Latency**: wall-clock seconds per image, 4-core CPU, float32, models already loaded
- **Reproduce:** `python scripts/evaluate.py` (≈ 20 min on CPU). Raw numbers and every generated caption are in `reports/evaluation.json`.

## Results

| Configuration | BLEU-1 | BLEU-4 | ROUGE-L | CIDEr-D | ITM match | sec / image |
|---|---:|---:|---:|---:|---:|---:|
| BLIP-base, greedy decoding | 0.742 | 0.351 | 0.605 | 1.819 | 0.937 | **1.0** |
| BLIP-large, greedy decoding | 0.751 | 0.326 | 0.603 | 1.757 | 0.883 | 2.2 |
| BLIP-large, beam search (k=5) | **0.775** | **0.416** | **0.641** | **1.957** | 0.882 | 3.2 |
| **PixelProse Balanced (default)**: 5 beams + ITM re-rank | 0.771 | 0.408 | 0.626 | 1.945 | 0.921 | 3.9 |
| PixelProse Detailed: beam + sampling + ITM re-rank | 0.771 | 0.399 | 0.625 | 1.913 | **0.970** | 5.6 |

## What we learned

1. **Decoding matters more than model size.** BLIP-large with naive greedy decoding scored *below* BLIP-base (CIDEr-D 1.757 vs 1.819). Beam search unlocked the large model: **+8% CIDEr-D** over the baseline and the best scores on every reference metric.
2. **Re-ranking buys grounding almost for free.** Choosing among the 5 beams with the ITM model keeps CIDEr-D within 0.6% of plain beam search, while the image-match rises from 88% to 92%. That is why *Balanced* is the default. It is also deterministic, so a live demo gives the same caption every time and repeat requests are served from the cache.
3. **Detailed mode is richer but riskier.** Adding sampled drafts produces more specific captions (*“a bunch of red and white airplanes parked on an airport tarmac”*, *“two men standing next to each other on a soccer field”*) and the highest image-match (97%). Short references don't contain those details, so the n-gram metrics fall slightly. Sampling can also invent text: on *The Scream* it produced *“an edvardt is the scream, painting by edvard stamten”*. The matcher liked it (the painting really is *The Scream*), but the spelling is garbage. Use Detailed for exploration, Balanced for reliability.
4. **Speed trade-off:** BLIP-base is about 2× faster than BLIP-large at the same decoding, which makes it the right choice for old laptops.

## Example captions

| Image | Base · greedy | Large · beam 5 | **Balanced (default)** | Detailed |
|---|---|---|---|---|
| airliners_at_airport | a row of airplanes parked on the tarmac | a number of airplanes on a run way | a number of airplanes on a runway near a building | a bunch of red and white airplanes parked on an airport tarmac |
| street_with_bus | people are standing on the sidewalk near a bus | a group of people crossing a street in front of a bus | a group of people crossing a street in front of a **blue** bus | a group of people crossing a street in front of a blue bus |
| stir_fry_plate | a plate of food with onions, carrots and other vegetables | a blue and white plate topped with lots of food | a blue and white plate topped with sliced up vegetables | a blue and white plate topped with sliced up vegetables |
| pug_in_wig | a dog with a wig and a jacket on | a pug dog wearing a wig and a jacket | a pug dog wearing a wig and a jacket | a pug dog wearing a wig and a jacket |
| starry_night_painting | a painting of a starry night with the moon in the sky | a painting of a starry night over a town | a painting of a starry night over a town | a painting of a starry night over a town |
| the_scream_painting | a painting of a person with a scream on it | a painting of two people standing on a bridge | a painting of two people standing on a bridge | an edvardt is the scream, painting by edvard stamten ⚠️ |

## Limitations of this evaluation

- 44 images is a small set: these numbers show **trends**, not leaderboard scores. The official COCO Karpathy test split has 5,000 images.
- The references were written by the project team, in a short COCO-like style, so they favour concise captions.
- The ITM match is measured by the same model the re-ranker uses (see above).
- One post-processing rule was added after this run: collapsing repeats like “lava and lava” → “lava”. It affects a single caption here and only makes it cleaner.

For reference, the BLIP paper reports CIDEr 136.7 (BLEU-4 40.4) on COCO Karpathy test for the ViT-L captioner. COCO CIDEr is scaled ×100 and computed on a very different corpus, so it is not comparable with the numbers above.
