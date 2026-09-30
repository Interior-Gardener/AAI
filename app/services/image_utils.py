"""Image loading, validation and lightweight analysis (palette, metadata)."""

from __future__ import annotations

import hashlib
import io
import ipaddress
import socket
import urllib.request
from dataclasses import dataclass
from urllib.parse import urlparse

from PIL import Image, ImageOps, ImageStat, UnidentifiedImageError

# Pillow refuses absurdly large images (decompression bombs) above this many pixels.
Image.MAX_IMAGE_PIXELS = 80_000_000

# The models only see 384x384 pixels, so anything above this is wasted work.
MAX_WORKING_SIDE = 1600
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "BMP", "GIF", "TIFF", "MPO"}


class ImageError(ValueError):
    """Raised for user-facing image problems (bad format, too large, unreachable URL...)."""


@dataclass
class LoadedImage:
    image: Image.Image  # RGB, EXIF-rotated, downscaled working copy
    digest: str  # sha1 of the original bytes, used as a cache key
    format: str
    original_size: tuple[int, int]
    num_bytes: int


def load_image(data: bytes, max_bytes: int) -> LoadedImage:
    if not data:
        raise ImageError("The uploaded file is empty.")
    if len(data) > max_bytes:
        raise ImageError(f"Image is larger than {max_bytes // (1024 * 1024)} MB.")
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ImageError("That file is not a readable image.") from exc

    fmt = (img.format or "UNKNOWN").upper()
    if fmt not in ALLOWED_FORMATS:
        raise ImageError(f"Unsupported image format: {fmt}.")

    original_size = img.size
    if getattr(img, "is_animated", False):
        img.seek(0)  # caption the first frame of GIFs
    img = ImageOps.exif_transpose(img)
    img = _to_rgb(img)
    img.thumbnail((MAX_WORKING_SIDE, MAX_WORKING_SIDE), Image.Resampling.LANCZOS)

    return LoadedImage(
        image=img,
        digest=hashlib.sha1(data).hexdigest(),
        format=fmt,
        original_size=original_size,
        num_bytes=len(data),
    )


def _to_rgb(img: Image.Image) -> Image.Image:
    """Flatten transparency onto white so transparent PNGs don't turn black."""
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        background = Image.new("RGB", rgba.size, (255, 255, 255))
        background.paste(rgba, mask=rgba.getchannel("A"))
        return background
    return img.convert("RGB")


def _is_public_host(hostname: str) -> bool:
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return False
    for info in infos:
        addr = ipaddress.ip_address(info[4][0])
        if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved or addr.is_multicast:
            return False
    return True


def fetch_image_bytes(url: str, max_bytes: int, timeout: float) -> bytes:
    """Download an image from a public http(s) URL with size and host checks."""
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ImageError("Please provide a valid http(s) image URL.")
    if not _is_public_host(parsed.hostname):
        raise ImageError("That URL points to a private or unknown host.")

    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (PixelProse caption bot)"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            final_host = urlparse(resp.geturl()).hostname or ""
            if not _is_public_host(final_host):
                raise ImageError("That URL redirects to a private host.")
            content_type = resp.headers.get("Content-Type", "")
            if content_type and not content_type.startswith(("image/", "application/octet-stream")):
                raise ImageError("That URL does not point to an image.")
            data = resp.read(max_bytes + 1)
    except ImageError:
        raise
    except Exception as exc:  # network errors, HTTP errors, timeouts
        raise ImageError(f"Could not download the image ({exc.__class__.__name__}).") from exc

    if len(data) > max_bytes:
        raise ImageError(f"Image is larger than {max_bytes // (1024 * 1024)} MB.")
    return data


def _hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def color_palette(img: Image.Image, count: int = 6) -> list[dict]:
    """Dominant colours via median-cut quantisation on a small thumbnail."""
    small = img.copy()
    small.thumbnail((160, 160))
    quantized = small.quantize(colors=count, method=Image.Quantize.MEDIANCUT)
    palette = quantized.getpalette() or []
    counts = sorted(quantized.getcolors() or [], reverse=True)
    total = sum(c for c, _ in counts) or 1
    colors = []
    for pixels, index in counts[:count]:
        rgb = tuple(palette[index * 3 : index * 3 + 3])
        colors.append({"hex": _hex(rgb), "rgb": list(rgb), "share": round(pixels / total, 4)})
    return colors


def image_metadata(loaded: LoadedImage) -> dict:
    img = loaded.image
    width, height = loaded.original_size
    stat = ImageStat.Stat(img.convert("L"))
    brightness = stat.mean[0] / 255
    contrast = stat.stddev[0] / 128
    return {
        "width": width,
        "height": height,
        "megapixels": round(width * height / 1_000_000, 2),
        "aspect_ratio": _aspect(width, height),
        "orientation": "landscape" if width > height else "portrait" if height > width else "square",
        "format": loaded.format,
        "file_size_kb": round(loaded.num_bytes / 1024, 1),
        "brightness": round(brightness, 3),
        "contrast": round(min(contrast, 1.0), 3),
        "tone": "bright" if brightness > 0.62 else "dark" if brightness < 0.32 else "balanced",
    }


def _aspect(width: int, height: int) -> str:
    from math import gcd

    g = gcd(width, height) or 1
    w, h = width // g, height // g
    if w > 50 or h > 50:  # e.g. 1365:2048 is not helpful, show a decimal instead
        return f"{width / height:.2f}:1"
    return f"{w}:{h}"
