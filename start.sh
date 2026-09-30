#!/usr/bin/env bash
# Launch PixelProse on http://127.0.0.1:8000
cd "$(dirname "$0")"
source .venv/bin/activate
python run.py "$@"
