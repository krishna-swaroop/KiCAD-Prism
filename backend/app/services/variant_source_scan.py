"""Read only catalog forms, without parsing geometry or interpreting quoted text.

Quoted spans are masked once, retaining offsets. C-level searches/counts skip
large numeric board payloads; Python only visits relevant structural forms.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass

_STRINGS = re.compile(r'"(?:\\.|[^"\\])*(?:"|$)')
# Whitespace after an opening parenthesis is legal; a literal "(variant"
# substring alone would miss those records. False positives in quoted text
# merely take the structural path below.
_RELEVANT = re.compile(r'\(\s*variants?(?=\s|\))')
_PARENS = re.compile(r'[()]')
_FORMS = re.compile(r'\(\s*(kicad_pcb|kicad_sch|footprint|symbol|sheet|instances|project|path|variants|variant|property)(?=\s|\))')
_NAME = re.compile(r'^\(\s*(?:name|description)\s+("(?:\\.|[^"\\])*")\s*\)$')
_PROPERTY = re.compile(r'\(\s*property\s+("(?:\\.|[^"\\])*")\s+("(?:\\.|[^"\\])*")')


@dataclass(frozen=True)
class SourceRecords:
    header: tuple[tuple[str, str | None], ...] = ()
    names: tuple[str, ...] = ()
    sheets: tuple[str, ...] = ()
    readable: bool = True


def _end(mask: str, start: int) -> int:
    depth = 0
    for match in _PARENS.finditer(mask, start):
        depth += 1 if match.group() == '(' else -1
        if depth == 0:
            return match.end()
    raise ValueError('Unbalanced source')


def scan_source(text: str, root: str) -> SourceRecords:
    # This is metadata discovery, not a full KiCad validator. Without variant
    # forms or possible sheet links there is nothing to extract. The native
    # parsers still validate files when building/rendering the design.
    if not _RELEVANT.search(text) and (root != "kicad_sch" or "Sheetfile" not in text):
        return SourceRecords()
    try:
        return _scan_source(text, root)
    except (ValueError, IndexError):
        return SourceRecords(readable=False)


def _scan_source(text: str, root: str) -> SourceRecords:
    malformed = False
    def hide(match: re.Match[str]) -> str:
        nonlocal malformed
        value = match.group()
        # An unterminated string cannot participate in form discovery.
        if not value.endswith('"') or len(value) == 1:
            malformed = True
        return ' ' * len(value)
    mask = _STRINGS.sub(hide, text)
    if malformed or not re.match(r'\s*\(\s*' + root + r'(?=\s|\))', mask):
        return SourceRecords(readable=False)
    depth = 0
    roots = 0
    for char in _PARENS.findall(mask):
        depth += 1 if char == '(' else -1
        if depth == 0:
            roots += 1
        if depth < 0:
            return SourceRecords(readable=False)
    if depth != 0 or roots != 1:
        return SourceRecords(readable=False)
    root_end = mask.rfind(')') + 1
    if text[root_end:].strip():
        return SourceRecords(readable=False)

    header: list[tuple[str, str | None]] = []
    names: list[str] = []
    sheets: list[str] = []
    parents: list[tuple[int, str]] = []
    offset = 0
    depth = 0
    for match in _FORMS.finditer(mask):
        depth += mask.count('(', offset, match.start()) - mask.count(')', offset, match.start())
        while parents and parents[-1][0] >= depth:
            parents.pop()
        parent = parents[-1][1] if parents and parents[-1][0] == depth - 1 else None
        tag = match.group(1)
        if tag == 'variant':
            is_header = root == 'kicad_pcb' and parent == 'variants' and depth == 2
            is_record = (root == 'kicad_pcb' and parent == 'footprint') or (
                root == 'kicad_sch' and parent == 'path' and any(p[1] == 'instances' for p in parents)
            )
            if is_header or is_record:
                end = _end(mask, match.start())
                fields: dict[str, str] = {}
                position = match.end()
                while position < end:
                    start = mask.find('(', position, end)
                    if start < 0:
                        break
                    stop = _end(mask, start)
                    scalar = _NAME.match(text[start:stop])
                    if scalar:
                        key = mask[start + 1:stop].split()[0]
                        fields[key] = json.loads(scalar.group(1))
                    position = stop
                name = fields.get('name')
                if name and name != '< Default >':
                    if is_header:
                        header.append((name, fields.get('description')))
                    else:
                        names.append(name)
        elif tag == 'property' and parent == 'sheet':
            field = _PROPERTY.match(text, match.start())
            if field and json.loads(field.group(1)) == 'Sheetfile':
                sheets.append(json.loads(field.group(2)))
        parents.append((depth, tag))
        depth += 1
        offset = match.end()
    return SourceRecords(tuple(header), tuple(names), tuple(sheets))
