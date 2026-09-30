"""
Offline fallback: build Hugging Face-format BLIP models from Salesforce's original checkpoints.

Normally the app downloads its models from the Hugging Face Hub. Some college and
corporate networks block huggingface.co but allow Google Cloud Storage, where Salesforce
hosts the original BLIP research checkpoints. This script downloads those checkpoints,
renames their weights to the `transformers` layout and writes ready-to-use model folders.

Usage:
    python scripts/convert_original_blip.py --out models
    # then start the app with local weights:
    CAPTION_MODEL_LARGE=models/blip-caption-large ... python run.py

The key-renaming rules follow the official `transformers` conversion script
(src/transformers/models/blip/convert_blip_original_pytorch_to_hf.py).
"""

from __future__ import annotations

import argparse
import re
import sys
import urllib.request
from pathlib import Path

import torch
import torch.nn.functional as F
from transformers import (
    BertTokenizerFast,
    BlipConfig,
    BlipForConditionalGeneration,
    BlipForImageTextRetrieval,
    BlipForQuestionAnswering,
    BlipImageProcessor,
    BlipProcessor,
)

GCS = "https://storage.googleapis.com/sfr-vision-language-research/BLIP/models"
VOCAB_URL = "https://raw.githubusercontent.com/microsoft/SDNet/master/bert_vocab_files/bert-base-uncased-vocab.txt"

# name -> (checkpoint file, model class, ViT size)
MODELS = {
    "blip-caption-large": ("model_large_caption.pth", BlipForConditionalGeneration, "large"),
    "blip-caption-base": ("model_base_caption_capfilt_large.pth", BlipForConditionalGeneration, "base"),
    "blip-itm-base": ("model_base_retrieval_coco.pth", BlipForImageTextRetrieval, "base"),
    "blip-vqa-base": ("model_base_vqa_capfilt_large.pth", BlipForQuestionAnswering, "base"),
}

IMAGE_SIZE = 384


def download(url: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  downloading {url}")
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url) as resp, open(tmp, "wb") as fh:
        while chunk := resp.read(1 << 20):
            fh.write(chunk)
    tmp.rename(dest)
    return dest


def rename_key(key: str) -> str:
    if "visual_encoder" in key:
        key = re.sub("visual_encoder*", "vision_model.encoder", key)
    if "blocks" in key:
        key = re.sub(r"blocks", "layers", key)
    if "attn" in key:
        key = re.sub(r"attn", "self_attn", key)
    if "norm1" in key:
        key = re.sub(r"norm1", "layer_norm1", key)
    if "norm2" in key:
        key = re.sub(r"norm2", "layer_norm2", key)
    if "encoder.norm" in key:
        key = re.sub(r"encoder.norm", "post_layernorm", key)
    if "encoder.patch_embed.proj" in key:
        key = re.sub(r"encoder.patch_embed.proj", "embeddings.patch_embedding", key)
    if "encoder.pos_embed" in key:
        key = re.sub(r"encoder.pos_embed", "embeddings.position_embedding", key)
    if "encoder.cls_token" in key:
        key = re.sub(r"encoder.cls_token", "embeddings.class_embedding", key)
    if "self_attn" in key:
        key = re.sub(r"self_attn.proj", "self_attn.projection", key)
    return key


def interpolate_pos_embed(pos_embed: torch.Tensor, num_patches: int) -> torch.Tensor:
    """Resize ViT position embeddings (e.g. the 480px VQA checkpoint) to the 384px grid."""
    extra, grid = pos_embed[:, :1], pos_embed[:, 1:]
    old = int(grid.shape[1] ** 0.5)
    new = int(num_patches**0.5)
    if old == new:
        return pos_embed
    dim = grid.shape[-1]
    grid = grid.reshape(1, old, old, dim).permute(0, 3, 1, 2)
    grid = F.interpolate(grid, size=(new, new), mode="bicubic", align_corners=False)
    grid = grid.permute(0, 2, 3, 1).flatten(1, 2)
    return torch.cat([extra, grid], dim=1)


def make_config(vit: str) -> BlipConfig:
    if vit == "large":
        vision = dict(hidden_size=1024, intermediate_size=4096, num_hidden_layers=24, num_attention_heads=16)
    else:
        vision = dict(hidden_size=768, intermediate_size=3072, num_hidden_layers=12, num_attention_heads=12)
    # The original ViT uses LayerNorm eps=1e-6.
    vision.update(image_size=IMAGE_SIZE, patch_size=16, layer_norm_eps=1e-6)
    # BlipTextConfig defaults to 8 heads, but BLIP's BERT-base text transformer has 12. Weight shapes are
    # identical either way, so a wrong value loads silently and quietly degrades every prediction.
    text = dict(vocab_size=30524, encoder_hidden_size=vision["hidden_size"], num_attention_heads=12)
    return BlipConfig(projection_dim=512, image_text_hidden_size=256, vision_config=vision, text_config=text)


def make_processor(vocab_file: Path) -> BlipProcessor:
    tokenizer = BertTokenizerFast(vocab_file=str(vocab_file), do_lower_case=True, model_max_length=512)
    tokenizer.add_special_tokens({"bos_token": "[DEC]"})
    tokenizer.add_special_tokens({"additional_special_tokens": ["[ENC]"]})
    image_processor = BlipImageProcessor(
        size={"height": IMAGE_SIZE, "width": IMAGE_SIZE},
        image_mean=[0.48145466, 0.4578275, 0.40821073],
        image_std=[0.26862954, 0.26130258, 0.27577711],
    )
    return BlipProcessor(image_processor=image_processor, tokenizer=tokenizer)


def convert(name: str, cache: Path, out: Path, processor: BlipProcessor) -> None:
    filename, model_cls, vit = MODELS[name]
    print(f"[{name}]")
    ckpt = torch.load(download(f"{GCS}/{filename}", cache / filename), map_location="cpu", weights_only=False)
    state = ckpt.get("model", ckpt)

    model = model_cls(make_config(vit)).eval()
    expected = model.state_dict()
    num_patches = (IMAGE_SIZE // 16) ** 2

    converted = {}
    for key, value in state.items():
        new_key = rename_key(key)
        if new_key not in expected:
            continue  # momentum encoders, queues, etc. are training-only
        if new_key.endswith("embeddings.position_embedding"):
            value = interpolate_pos_embed(value, num_patches)
        converted[new_key] = value

    missing, _ = model.load_state_dict(converted, strict=False)
    missing = [k for k in missing if not k.endswith(("position_ids", "decoder.bias"))]
    if missing:
        raise RuntimeError(f"{name}: weights missing after conversion: {missing[:10]}")
    model.tie_weights()

    target = out / name
    model.save_pretrained(target)
    processor.save_pretrained(target)
    print(f"  saved -> {target}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default="models", help="output folder for converted models")
    parser.add_argument("--cache", default="models/.original", help="where to keep the downloaded .pth files")
    parser.add_argument("--only", nargs="*", choices=list(MODELS), help="convert only these models")
    parser.add_argument("--vocab", help="path to an existing bert-base-uncased vocab.txt")
    args = parser.parse_args()

    out, cache = Path(args.out), Path(args.cache)
    vocab = Path(args.vocab) if args.vocab else download(VOCAB_URL, cache / "vocab.txt")
    processor = make_processor(vocab)

    for name in args.only or MODELS:
        convert(name, cache, out, processor)
    print("Done. Point the app at these folders (see README → Offline setup).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
