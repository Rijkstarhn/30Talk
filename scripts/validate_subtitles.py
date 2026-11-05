#!/usr/bin/env python3
"""Validate aligned WebVTT cue timestamps and counts."""
import re
import sys
from pathlib import Path

TIME = re.compile(r'^\s*(\d{2}:)?\d{2}:\d{2}\.\d{3}\s+-->\s+(\d{2}:)?\d{2}:\d{2}\.\d{3}(?:\s+.*)?$')

def cues(path):
    text = Path(path).read_text(encoding='utf-8-sig')
    if not text.lstrip().startswith('WEBVTT'):
        raise ValueError(f'{path}: missing WEBVTT header')
    blocks = re.split(r'\n\s*\n', text.replace('\r\n', '\n').strip())
    result = []
    for block in blocks[1:]:
        lines = block.splitlines()
        idx = next((i for i, line in enumerate(lines) if '-->' in line), None)
        if idx is None:
            continue
        if not TIME.fullmatch(lines[idx]):
            raise ValueError(f'{path}: malformed timestamp: {lines[idx]}')
        if not any(line.strip() for line in lines[idx+1:]):
            raise ValueError(f'{path}: empty cue after {lines[idx]}')
        result.append((lines[idx], '\n'.join(lines[idx+1:])))
    if not result:
        raise ValueError(f'{path}: no cues')
    return result

def validate(en, zh):
    a, b = cues(en), cues(zh)
    if len(a) != len(b):
        raise ValueError(f'Cue count mismatch: English={len(a)}, Chinese={len(b)}')
    for i, ((t1, _), (t2, _)) in enumerate(zip(a, b), 1):
        if t1 != t2:
            raise ValueError(f'Cue {i}: timestamps differ: {t1!r} != {t2!r}')
    return len(a)

if __name__ == '__main__':
    try:
        print(f'Validated {validate(sys.argv[1], sys.argv[2])} aligned cues')
    except (ValueError, OSError, IndexError) as exc:
        sys.exit(f'Subtitle validation failed: {exc}')
