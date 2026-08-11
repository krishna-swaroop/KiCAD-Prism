"""Low-overhead structured timing for Design Comparison builds.

The comparison pipeline uses two worker threads, so a flat list of elapsed
durations is not enough to explain the critical path.  This recorder keeps a
monotonic timeline and per-thread CPU durations while remaining safe to call
from both revision workers.
"""

from __future__ import annotations

import contextlib
import json
import os
import platform
import sys
import threading
import time
from pathlib import Path
from typing import Any, Iterator

try:
    import resource  # Unix only; absent on Windows.
except ImportError:  # pragma: no cover - platform dependent
    resource = None


def _peak_rss_bytes() -> int:
    if resource is None:
        return 0
    value = int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
    # Darwin reports bytes; Linux and the BSDs report KiB.
    return value if sys.platform == "darwin" else value * 1024


class DesignCompareBenchmark:
    """Collect nested, thread-safe benchmark spans for one comparison run."""

    schema = "prism.design_compare_benchmark_a0"

    def __init__(self, *, job_id: str, metadata: dict[str, Any] | None = None) -> None:
        self.job_id = job_id
        self._started_ns = time.perf_counter_ns()
        self._lock = threading.Lock()
        self._events: list[dict[str, Any]] = []
        self._metadata = dict(metadata or {})

    @contextlib.contextmanager
    def span(
        self,
        phase: str,
        *,
        scope: str = "comparison",
        metadata: dict[str, Any] | None = None,
    ) -> Iterator[None]:
        started_ns = time.perf_counter_ns()
        cpu_started_ns = time.thread_time_ns()
        status = "ok"
        try:
            yield
        except BaseException:
            status = "error"
            raise
        finally:
            self.record_duration(
                phase,
                started_ns=started_ns,
                elapsed_ns=time.perf_counter_ns() - started_ns,
                cpu_ns=time.thread_time_ns() - cpu_started_ns,
                scope=scope,
                status=status,
                metadata=metadata,
            )

    def record_duration(
        self,
        phase: str,
        *,
        elapsed_ns: int,
        cpu_ns: int,
        scope: str = "comparison",
        status: str = "ok",
        metadata: dict[str, Any] | None = None,
        started_ns: int | None = None,
    ) -> None:
        finished_ns = time.perf_counter_ns()
        event_started_ns = started_ns if started_ns is not None else finished_ns - elapsed_ns
        event = {
            "phase": phase,
            "scope": scope,
            "status": status,
            "startedMs": round((event_started_ns - self._started_ns) / 1_000_000, 3),
            "elapsedMs": round(elapsed_ns / 1_000_000, 3),
            "cpuMs": round(cpu_ns / 1_000_000, 3),
            "thread": threading.current_thread().name,
        }
        if metadata:
            event["metadata"] = metadata
        with self._lock:
            self._events.append(event)

    def mark(
        self,
        phase: str,
        *,
        scope: str = "comparison",
        metadata: dict[str, Any] | None = None,
    ) -> None:
        self.record_duration(
            phase,
            elapsed_ns=0,
            cpu_ns=0,
            scope=scope,
            metadata=metadata,
        )

    def update_metadata(self, **values: Any) -> None:
        with self._lock:
            self._metadata.update(values)

    @property
    def started_ms(self) -> float:
        """This recorder's origin on the same clock ``time.perf_counter`` reads."""
        return self._started_ns / 1_000_000

    def drain_events(self) -> list[dict[str, Any]]:
        """Return this recorder's events so a worker can ship them home.

        A revision built in a separate process records against its own
        timeline; the parent replays the events through ``absorb_events`` so
        one comparison still produces one benchmark artifact.
        """
        with self._lock:
            return [dict(event) for event in self._events]

    def absorb_events(
        self,
        events: list[dict[str, Any]],
        *,
        offset_ms: float = 0.0,
        thread: str | None = None,
    ) -> None:
        """Merge events recorded elsewhere onto this recorder's timeline.

        ``startedMs`` arrives relative to the worker's own start, so it is
        shifted by the parent-observed offset. Without that the spans would
        all appear to begin at zero and the critical path would be unreadable.
        """
        with self._lock:
            for event in events:
                shifted = dict(event)
                shifted["startedMs"] = round(
                    float(shifted.get("startedMs", 0.0)) + offset_ms, 3
                )
                if thread is not None:
                    shifted["thread"] = thread
                self._events.append(shifted)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            events = sorted(
                (dict(event) for event in self._events),
                key=lambda event: (event["startedMs"], event["scope"], event["phase"]),
            )
            metadata = dict(self._metadata)
        return {
            "schema": self.schema,
            "jobId": self.job_id,
            "totalElapsedMs": round(
                (time.perf_counter_ns() - self._started_ns) / 1_000_000,
                3,
            ),
            "environment": {
                "python": sys.version.split()[0],
                "platform": platform.platform(),
                "cpuCount": os.cpu_count(),
                "peakRssBytes": _peak_rss_bytes(),
            },
            "metadata": metadata,
            "events": events,
        }

    def write(self, path: Path) -> dict[str, Any]:
        payload = self.snapshot()
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(
            json.dumps(payload, indent=2, sort_keys=False) + "\n",
            encoding="utf-8",
        )
        temporary.replace(path)
        return payload
