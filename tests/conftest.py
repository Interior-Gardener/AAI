import os
import sys
from pathlib import Path

# Never download or load real models during unit tests.
os.environ["PRELOAD_MODELS"] = "false"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
