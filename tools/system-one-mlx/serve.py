"""Serve a System One decision model on Apple silicon with MLX (spike, not a Prism dependency).

H2O-Lightning-4B ships a standard-library shim that turns ``POST /v1/systemone``
into one label-logprob read per question against vLLM. vLLM does not run on
macOS, so this puts an MLX backend behind the same shim: the shim builds the
prompt, picks the label tokens and calibrates; MLX runs one forward pass.

    uv run --with mlx-lm python tools/system-one-mlx/serve.py \
        --model /path/to/mlx-q8 --shim /path/to/h2o_lightning_shim.py --config /path/to/serve_config.json

The shim and its config come with the model's Hugging Face repo (Apache-2.0)
and are loaded from there, not copied here.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import threading

import mlx.core as mx
from mlx_lm import load


class MlxBackend:
    """The four calls the shim makes of vLLM, answered in-process."""

    def __init__(self, model_path: str, served_name: str, context: int) -> None:
        # Every prompt length leaves its own buffers in MLX's cache; uncapped it grew to 11 GB and swapped a 16 GB Mac.
        mx.set_cache_limit(512 * 1024 * 1024)
        self.model, self.tokenizer = load(model_path)
        self.served_name = served_name
        self.context = context
        self.base = f"mlx:{model_path}"
        self.lock = threading.Lock()  # one Metal stream; the shim's pool would otherwise race it

    def call(self, method: str, path: str, body=None):
        if (method, path) == ("GET", "/v1/models"):
            return 200, {"data": [{"id": self.served_name, "max_model_len": self.context}]}
        return 404, {"error": f"{method} {path} is not served by the MLX backend"}

    def tokenize(self, text: str) -> list[int]:
        return self.tokenizer.encode(text, add_special_tokens=False)

    def detokenize(self, ids: list[int]) -> str:
        return self.tokenizer.decode(ids)

    def label_logprobs(self, prompt: str, ids: list[int]):
        tokens = self.tokenize(prompt)
        if len(tokens) > self.context:
            raise ValueError(f"prompt of {len(tokens)} tokens is over the {self.context}-token context")
        with self.lock:
            logits = self.model(mx.array([tokens]))[0, -1].astype(mx.float32)
            logprobs = logits - mx.logsumexp(logits)
            picked = logprobs[mx.array(ids)].tolist()
        return dict(zip(ids, picked)), {"prompt_tokens": len(tokens), "completion_tokens": 1}


def _load_shim(path: str):
    spec = importlib.util.spec_from_file_location("h2o_lightning_shim", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--model", required=True, help="MLX model directory")
    ap.add_argument("--shim", required=True, help="h2o_lightning_shim.py from the model repo")
    ap.add_argument("--config", required=True, help="serve_config.json from the model repo")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8741)
    ap.add_argument("--context", type=int, default=16384)
    a = ap.parse_args()
    shim_mod = _load_shim(a.shim)
    cfg = json.load(open(a.config))
    cfg.pop("image", None)  # text only: the image path needs vLLM's chat endpoint
    contract = shim_mod.Contract(cfg)
    shim = shim_mod.Shim(contract, MlxBackend(a.model, contract.model, a.context))
    shim.check_backend()  # verifies every option label is one token at the answer slot
    server = shim_mod.Server((a.host, a.port), shim_mod.make_handler(shim))
    print(f"system-one-mlx on {a.host}:{a.port} ({contract.model}, T {contract.temperature_by_type})", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
