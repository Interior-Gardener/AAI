import io

import pytest
from PIL import Image

from app.services.image_utils import ImageError, color_palette, fetch_image_bytes, image_metadata, load_image

MB = 1024 * 1024


def encode(img: Image.Image, fmt: str = "PNG") -> bytes:
    buf = io.BytesIO()
    img.save(buf, fmt)
    return buf.getvalue()


def test_load_png_to_rgb():
    loaded = load_image(encode(Image.new("RGB", (64, 32), "red")), MB)
    assert loaded.image.mode == "RGB"
    assert loaded.original_size == (64, 32)
    assert loaded.format == "PNG"
    assert len(loaded.digest) == 40


def test_transparent_png_is_flattened_on_white():
    img = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
    loaded = load_image(encode(img), MB)
    assert loaded.image.getpixel((5, 5)) == (255, 255, 255)


def test_large_images_are_downscaled_for_the_model():
    loaded = load_image(encode(Image.new("RGB", (4000, 1000)), "JPEG"), 10 * MB)
    assert max(loaded.image.size) == 1600
    assert loaded.original_size == (4000, 1000)


def test_rejects_non_images_and_oversized_files():
    with pytest.raises(ImageError):
        load_image(b"definitely not an image", MB)
    with pytest.raises(ImageError):
        load_image(b"", MB)
    with pytest.raises(ImageError):
        load_image(b"x" * (MB + 1), MB)


def test_palette_shares_sum_to_one():
    img = Image.new("RGB", (100, 100), "blue")
    img.paste(Image.new("RGB", (50, 100), "yellow"), (0, 0))
    colors = color_palette(img, 4)
    assert abs(sum(c["share"] for c in colors) - 1) < 0.01
    assert colors[0]["hex"].startswith("#")


def test_metadata():
    loaded = load_image(encode(Image.new("RGB", (1920, 1080), "white"), "JPEG"), MB)
    meta = image_metadata(loaded)
    assert meta["aspect_ratio"] == "16:9"
    assert meta["orientation"] == "landscape"
    assert meta["tone"] == "bright"


@pytest.mark.parametrize("url", ["ftp://example.com/a.jpg", "not a url", "http://127.0.0.1/a.jpg", "http://localhost/a.png"])
def test_url_fetch_blocks_bad_or_private_urls(url):
    with pytest.raises(ImageError):
        fetch_image_bytes(url, MB, timeout=2)
