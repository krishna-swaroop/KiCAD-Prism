"""The Supply benchmark's pure helpers, without a database or a browser.

The script is loaded by path because it lives under ``scripts/``, outside the
backend package the tests import.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_benchmark():
    spec = importlib.util.spec_from_file_location("prism_benchmark_supply", REPO_ROOT / "scripts" / "benchmark_supply.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


benchmark = _load_benchmark()


def test_bench_database_name_accepts_a_bench_database():
    assert benchmark.bench_database_name("postgresql://u:p@h/bench_x") == "bench_x"
    assert benchmark.bench_database_name("postgresql+psycopg://u:p@h/bench_x") == "bench_x"


def test_bench_database_name_refuses_an_application_database():
    with pytest.raises(SystemExit) as refused:
        benchmark.bench_database_name("postgresql://u:p@h/kicad_prism")
    assert "bench_" in str(refused.value)


def test_bench_database_name_refuses_a_url_without_a_database():
    with pytest.raises(SystemExit) as refused:
        benchmark.bench_database_name("postgresql://u:p@h")
    assert "bench_" in str(refused.value)


def test_percentile_on_a_known_list():
    values = [float(value) for value in range(1, 11)]
    assert benchmark.percentile(values, 50) == 5.0
    assert benchmark.percentile(values, 95) == 10.0
    assert benchmark.percentile([], 95) == 0.0


def test_rss_normalisation_reports_bytes():
    assert benchmark.rss_bytes(1234, "darwin") == 1234
    assert benchmark.rss_bytes(1234, "linux") == 1234 * 1024
