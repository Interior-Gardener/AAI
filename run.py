"""Start the PixelProse web app:  python run.py  (then open http://127.0.0.1:8000)."""

import argparse

import uvicorn

from app.config import settings


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the PixelProse image caption generator")
    parser.add_argument("--host", default=settings.host, help="use 0.0.0.0 to open it to your local network")
    parser.add_argument("--port", type=int, default=settings.port)
    parser.add_argument("--reload", action="store_true", help="auto-restart on code changes (development)")
    args = parser.parse_args()

    print(f"\n  PixelProse is starting →  http://{'localhost' if args.host in ('0.0.0.0', '127.0.0.1') else args.host}:{args.port}\n")
    uvicorn.run("app.main:app", host=args.host, port=args.port, reload=args.reload, log_level="info")


if __name__ == "__main__":
    main()
