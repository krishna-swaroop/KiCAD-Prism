import json
import tempfile
import threading
import unittest
from pathlib import Path

from unittest.mock import patch

from app.services import design_compare_benchmark
from app.services.design_compare_benchmark import DesignCompareBenchmark


class DesignCompareBenchmarkTests(unittest.TestCase):
    def test_windows_without_resource_reports_no_process_rss(self) -> None:
        with patch.object(design_compare_benchmark, "resource", None):
            self.assertEqual(design_compare_benchmark._peak_rss_bytes(), 0)

    def test_records_parallel_scopes_and_publishes_atomically(self) -> None:
        benchmark = DesignCompareBenchmark(
            job_id="benchmark-test",
            metadata={"base": "old", "compare": "new"},
        )
        barrier = threading.Barrier(2)

        def worker(scope: str) -> None:
            with benchmark.span("semantic-index", scope=scope):
                barrier.wait(timeout=2)

        threads = [
            threading.Thread(target=worker, args=(f"revision:{side}",), name=side)
            for side in ("old", "new")
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=2)

        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "benchmark.json"
            benchmark.write(path)
            payload = json.loads(path.read_text(encoding="utf-8"))

        self.assertEqual(payload["schema"], "prism.design_compare_benchmark_a0")
        self.assertEqual(payload["metadata"]["base"], "old")
        self.assertEqual(
            {event["scope"] for event in payload["events"]},
            {"revision:old", "revision:new"},
        )
        self.assertTrue(all(event["elapsedMs"] >= 0 for event in payload["events"]))
        self.assertTrue(all(event["cpuMs"] >= 0 for event in payload["events"]))

    def test_absorbed_worker_events_land_on_the_parent_timeline(self) -> None:
        # A revision built in another process times itself from its own
        # start. Replayed unshifted, every worker span would claim to begin
        # at zero and the critical path would be unreadable.
        worker = DesignCompareBenchmark(job_id="worker")
        worker.record_duration(
            "load-project",
            elapsed_ns=2_000_000,
            cpu_ns=2_000_000,
            scope="revision:head:initial",
            started_ns=worker._started_ns,
        )
        events = worker.drain_events()
        self.assertEqual(len(events), 1)
        self.assertAlmostEqual(events[0]["startedMs"], 0.0, places=1)

        parent = DesignCompareBenchmark(job_id="parent")
        parent.absorb_events(events, offset_ms=500.0, thread="worker-head")

        payload = parent.snapshot()
        absorbed = next(
            event for event in payload["events"] if event["phase"] == "load-project"
        )
        self.assertAlmostEqual(absorbed["startedMs"], 500.0, places=1)
        self.assertEqual(absorbed["thread"], "worker-head")
        self.assertEqual(absorbed["scope"], "revision:head:initial")
        self.assertAlmostEqual(absorbed["elapsedMs"], 2.0, places=1)

    def test_draining_events_does_not_hand_out_live_references(self) -> None:
        benchmark = DesignCompareBenchmark(job_id="worker")
        benchmark.mark("snapshot", scope="revision:base:initial")

        drained = benchmark.drain_events()
        drained[0]["phase"] = "mutated"

        self.assertEqual(benchmark.snapshot()["events"][0]["phase"], "snapshot")


if __name__ == "__main__":
    unittest.main()
