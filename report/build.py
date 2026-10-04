"""
Two-pass build of the project report.

    python report/build.py

Pass 1 generates the .docx, renders it to PDF with LibreOffice and finds on which page every
heading, figure and table landed. Pass 2 rebuilds the .docx with those page numbers cached in the
Contents / List of Figures / List of Tables (they are real PAGEREF fields, so Word can also refresh
them with Ctrl+A, F9). A final PDF is written next to the .docx.

Requires: node (with the packages in report/package.json), LibreOffice, PyMuPDF (pip install pymupdf).
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pymupdf

HERE = Path(__file__).resolve().parent
DOCX = HERE / "PixelProse_Major_Project_Report.docx"
PDF = HERE / "PixelProse_Major_Project_Report.pdf"
PAGEMAP = HERE / ".pagemap.json"
SEARCH = HERE / ".search.json"


def run_node() -> None:
    subprocess.run(["node", str(HERE / "build_report.js")], check=True, env={**os.environ})


def to_pdf() -> Path:
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        sys.exit("LibreOffice (soffice) is required to compute page numbers.")
    with tempfile.TemporaryDirectory() as profile, tempfile.TemporaryDirectory() as out:
        subprocess.run([soffice, f"-env:UserInstallation=file://{profile}", "--headless", "--convert-to", "pdf",
                        "--outdir", out, str(DOCX)], check=True, capture_output=True, timeout=600)
        produced = Path(out) / (DOCX.stem + ".pdf")
        shutil.copy(produced, PDF)
    return PDF


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def roman(n: int) -> str:
    vals = [(10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i")]
    out = ""
    for v, s in vals:
        while n >= v:
            out += s
            n -= v
    return out


def page_map() -> dict[str, str]:
    doc = pymupdf.open(PDF)
    pages = [norm(p.get_text()) for p in doc]
    plan = json.loads(SEARCH.read_text())

    cert = next(i for i, t in enumerate(pages) if "This is to certify" in t)
    ch1 = next(i for i, t in enumerate(pages) if i > cert and "CHAPTER 1 INTRODUCTION" in t)
    special = {
        "fm_certificate": cert,
        "fm_lof": next(i for i, t in enumerate(pages) if "Figure No." in t),
        "fm_lot": next(i for i, t in enumerate(pages) if "Table No." in t),
        "fm_abbr": next(i for i, t in enumerate(pages) if "Abbreviation Description" in t),
    }
    result: dict[str, str] = {}
    for key, idx in special.items():
        result[key] = roman(idx - cert + 1)

    pointer = ch1
    missing = []
    for item in plan:
        if item["section"] != "main":
            continue
        text = norm(item["text"])
        found = next((i for i in range(pointer, len(pages)) if text in pages[i]), None)
        if found is None:
            missing.append(text)
            continue
        pointer = found
        result[item["id"]] = str(found - ch1 + 1)
    if missing:
        print("warning: not found in PDF:", missing[:8])
    print(f"PDF: {len(pages)} pages · front matter from page {cert + 1} · chapter 1 on page {ch1 + 1} · "
          f"chapters 1–8 span {int(result['bm_refs']) - 1} pages")
    return result


def main() -> None:
    PAGEMAP.unlink(missing_ok=True)
    previous = None
    for attempt in range(1, 4):
        run_node()
        to_pdf()
        current = page_map()
        PAGEMAP.write_text(json.dumps(current, indent=1))
        if current == previous:
            break
        previous = current
    run_node()
    to_pdf()
    print(f"Done: {DOCX.name} and {PDF.name}")


if __name__ == "__main__":
    main()
