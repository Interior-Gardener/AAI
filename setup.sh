#!/usr/bin/env bash
# One-time setup for macOS / Linux: virtual environment, packages, models.
set -euo pipefail
cd "$(dirname "$0")"
command -v python3 >/dev/null || { echo "Python 3.10+ is required"; exit 1; }
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
if [[ "$(uname)" == "Linux" ]] && ! command -v nvidia-smi >/dev/null; then
  # No NVIDIA GPU: the CPU build of PyTorch is ~2 GB smaller.
  pip install torch --index-url https://download.pytorch.org/whl/cpu
fi
pip install -r requirements.txt
python scripts/download_models.py
echo -e "\nSetup complete. Run ./start.sh to launch PixelProse."
