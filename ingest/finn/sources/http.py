"""A polite HTTP client shared by all source adapters (NFR-10).

- At most one request per `min_interval` seconds per host.
- Retries transient failures (429 / 5xx / connection errors) with backoff.
- Optional disk cache under data/raw/ with a time-to-live, so re-running the
  pipeline doesn't hit the exchanges again. data/raw/ is gitignored.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

ROOT = Path(__file__).resolve().parents[3]
RAW_DIR = ROOT / "data" / "raw"

# Exchange sites reject non-browser user agents, so we send a browser UA and
# identify ourselves in a separate header.
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)
DEFAULT_HEADERS = {
    "User-Agent": BROWSER_UA,
    "Accept-Language": "en-US,en;q=0.9",
    "X-Client": "FINN research prototype (low volume, end-of-day)",
}

_RETRYABLE = {429, 500, 502, 503, 504}


class FetchError(RuntimeError):
    pass


class PoliteClient:
    def __init__(self, min_interval: float = 1.0, timeout: float = 45.0, max_attempts: int = 3):
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)
        self.min_interval = min_interval
        self.timeout = timeout
        self.max_attempts = max_attempts
        self._last_hit: dict[str, float] = {}

    # ---- internals -------------------------------------------------------

    def _wait_turn(self, host: str) -> None:
        elapsed = time.monotonic() - self._last_hit.get(host, 0.0)
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self._last_hit[host] = time.monotonic()

    @staticmethod
    def _cache_path(url: str, params: dict | None, suffix: str) -> Path:
        key = hashlib.sha256(json.dumps([url, params], sort_keys=True).encode()).hexdigest()[:24]
        host = urlparse(url).netloc.replace(":", "_")
        return RAW_DIR / host / f"{key}{suffix}"

    def _fetch(self, url: str, params: dict | None, headers: dict | None) -> requests.Response:
        host = urlparse(url).netloc
        last: Exception | None = None
        for attempt in range(self.max_attempts):
            self._wait_turn(host)
            try:
                r = self.session.get(url, params=params, headers=headers, timeout=self.timeout)
            except requests.RequestException as e:
                last = e
            else:
                if r.status_code == 200:
                    return r
                last = FetchError(f"{r.status_code} from {host}: {r.text[:120]!r}")
                if r.status_code not in _RETRYABLE:
                    break
            time.sleep(2 ** attempt * 2)
        raise FetchError(f"GET {url} failed") from last

    def _cached(self, url, params, headers, ttl, suffix, decode, encode) -> Any:
        path = self._cache_path(url, params, suffix)
        if ttl and path.exists() and time.time() - path.stat().st_mtime < ttl:
            return decode(path.read_bytes())
        r = self._fetch(url, params, headers)
        value = decode(r.content)
        if ttl:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(encode(r.content))
        return value

    # ---- public API ------------------------------------------------------

    def get_json(self, url: str, params: dict | None = None, headers: dict | None = None, ttl: float = 0) -> Any:
        return self._cached(url, params, headers, ttl, ".json", json.loads, lambda b: b)

    def get_text(self, url: str, params: dict | None = None, headers: dict | None = None, ttl: float = 0) -> str:
        return self._cached(url, params, headers, ttl, ".html", lambda b: b.decode("utf-8", "replace"), lambda b: b)

    def get_bytes(self, url: str, params: dict | None = None, headers: dict | None = None, ttl: float = 0) -> bytes:
        suffix = Path(urlparse(url).path).suffix[:6] or ".bin"
        return self._cached(url, params, headers, ttl, suffix, lambda b: b, lambda b: b)


HOUR = 3600
DAY = 24 * HOUR
WEEK = 7 * DAY

client = PoliteClient()
