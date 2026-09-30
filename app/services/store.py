"""Small thread-safe LRU caches.

* ImageStore keeps recently uploaded images so follow-up requests (questions,
  heatmaps, match scores) only send a short `image_id` instead of re-uploading.
* ResultCache remembers caption results for (image, settings) pairs, so clicking
  "Generate" twice on the same image is instant.
"""

from __future__ import annotations

import threading
from collections import OrderedDict
from typing import Any, Hashable


class LRUCache:
    def __init__(self, capacity: int):
        self.capacity = max(1, capacity)
        self._data: OrderedDict[Hashable, Any] = OrderedDict()
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0

    def get(self, key: Hashable) -> Any | None:
        with self._lock:
            if key in self._data:
                self._data.move_to_end(key)
                self.hits += 1
                return self._data[key]
            self.misses += 1
            return None

    def put(self, key: Hashable, value: Any) -> None:
        with self._lock:
            self._data[key] = value
            self._data.move_to_end(key)
            while len(self._data) > self.capacity:
                self._data.popitem(last=False)

    def __len__(self) -> int:
        return len(self._data)

    def stats(self) -> dict:
        return {"size": len(self), "capacity": self.capacity, "hits": self.hits, "misses": self.misses}
