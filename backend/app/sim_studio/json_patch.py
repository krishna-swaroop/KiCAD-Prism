"""RFC 6902 JSON Patch and RFC 6901 JSON Pointer, for setup documents.

Small and dependency-free: setups are plain JSON (dicts, lists, scalars). The
patch applies to a deep copy, so a failing operation leaves the original
untouched, and the whole patch is atomic as RFC 6902 requires.
"""

from __future__ import annotations

import copy
from typing import Any

_MISSING = object()


class PatchError(ValueError):
    """A patch that cannot apply; the message names the operation and path."""


def parse_pointer(pointer: str) -> list[str]:
    if pointer == "":
        return []
    if not pointer.startswith("/"):
        raise PatchError(f"JSON Pointer must start with '/': {pointer!r}")
    return [part.replace("~1", "/").replace("~0", "~") for part in pointer[1:].split("/")]


def _index(container: list, token: str, pointer: str, *, allow_end: bool) -> int:
    if token == "-" and allow_end:
        return len(container)
    if not token.isdigit() or (len(token) > 1 and token.startswith("0")):
        raise PatchError(f"{pointer}: {token!r} is not an array index")
    index = int(token)
    limit = len(container) if allow_end else len(container) - 1
    if index > limit:
        raise PatchError(f"{pointer}: index {index} is out of range")
    return index


def _parent(document: Any, tokens: list[str], pointer: str) -> Any:
    node = document
    for token in tokens[:-1]:
        if isinstance(node, dict):
            if token not in node:
                raise PatchError(f"{pointer}: {token!r} does not exist")
            node = node[token]
        elif isinstance(node, list):
            node = node[_index(node, token, pointer, allow_end=False)]
        else:
            raise PatchError(f"{pointer}: cannot descend into a scalar")
    return node


def resolve(document: Any, pointer: str) -> Any:
    node = document
    for token in parse_pointer(pointer):
        if isinstance(node, dict):
            if token not in node:
                raise PatchError(f"{pointer}: {token!r} does not exist")
            node = node[token]
        elif isinstance(node, list):
            node = node[_index(node, token, pointer, allow_end=False)]
        else:
            raise PatchError(f"{pointer}: cannot descend into a scalar")
    return node


def _add(document: Any, pointer: str, value: Any) -> Any:
    tokens = parse_pointer(pointer)
    if not tokens:
        return value
    parent = _parent(document, tokens, pointer)
    if isinstance(parent, dict):
        parent[tokens[-1]] = value
    elif isinstance(parent, list):
        parent.insert(_index(parent, tokens[-1], pointer, allow_end=True), value)
    else:
        raise PatchError(f"{pointer}: parent is a scalar")
    return document


def _remove(document: Any, pointer: str) -> tuple[Any, Any]:
    tokens = parse_pointer(pointer)
    if not tokens:
        raise PatchError("cannot remove the whole document")
    parent = _parent(document, tokens, pointer)
    if isinstance(parent, dict):
        if tokens[-1] not in parent:
            raise PatchError(f"{pointer}: {tokens[-1]!r} does not exist")
        return document, parent.pop(tokens[-1])
    if isinstance(parent, list):
        return document, parent.pop(_index(parent, tokens[-1], pointer, allow_end=False))
    raise PatchError(f"{pointer}: parent is a scalar")


def _apply_one(document: Any, operation: Any, position: int) -> Any:
    if not isinstance(operation, dict):
        raise PatchError(f"operation {position} is not an object")
    op = operation.get("op")
    path = operation.get("path")
    if not isinstance(path, str):
        raise PatchError(f"operation {position}: 'path' is required")
    value = operation.get("value", _MISSING)
    if op in {"add", "replace", "test"} and value is _MISSING:
        raise PatchError(f"operation {position} ({op} {path}): 'value' is required")
    if op == "add":
        return _add(document, path, copy.deepcopy(value))
    if op == "remove":
        return _remove(document, path)[0]
    if op == "replace":
        resolve(document, path)
        if not parse_pointer(path):
            return copy.deepcopy(value)
        document, _ = _remove(document, path)
        return _add(document, path, copy.deepcopy(value))
    if op in {"move", "copy"}:
        source = operation.get("from")
        if not isinstance(source, str):
            raise PatchError(f"operation {position} ({op} {path}): 'from' is required")
        if op == "move" and (path + "/").startswith(source + "/") and path != source:
            raise PatchError(f"operation {position}: cannot move {source} into its own child")
        if op == "move":
            document, moved = _remove(document, source)
        else:
            moved = copy.deepcopy(resolve(document, source))
        return _add(document, path, moved)
    if op == "test":
        if resolve(document, path) != value:
            raise PatchError(f"operation {position}: test failed at {path}")
        return document
    raise PatchError(f"operation {position}: unknown op {op!r}")


def apply_patch(document: Any, operations: Any) -> Any:
    """``document`` with ``operations`` applied; the input is not modified."""

    if not isinstance(operations, list):
        raise PatchError("a JSON Patch is an array of operations")
    result = copy.deepcopy(document)
    for position, operation in enumerate(operations):
        result = _apply_one(result, operation, position)
    return result
