#!/usr/bin/env python3
"""Validate that a translated VTT has the same cues and timestamps as its source."""
import re
import sys
from pathlib import Path

TIMESTAMP = re.compile(r'^\d{2,}:\d{2}:\d{2}\.\d{3} --> \d{2,}:\d{2}:\d{2}\.\d{3}(?:\s.*)?$')

def parse(path):
    content = Path(path).read_text(encoding='utf-8-sig')
    if not content.lstrip().startswith('WEBVTT'):
        raise ValueError(f'{path}: missing WEBVTT header')
    cues = []
    blocks = re.split(r'\n\s*\n', content.replace('\r\n', '\n').strip())
    for block in blocks[1:]:
        lines = block.splitlines()
        idx = next((i for i, line in enumerate(lines) if '-->' in line), None)
        if idx is None:
            continue
        ts = lines[idx].strip()
        if not TIMESTAMP.fullmatch(ts):
            raise ValueError(f'{path}: malformed timestamp {ts!r}')
        text = '\n'.join(lines[idx+1:]).strip()
        if not text:
            raise ValueError(f'{path}: empty cue at {ts}')
        cues.append((ts, text))
    if not cues:
        raise ValueError(f'{path}: no cues')
    return cues

def main():
    if len(sys.argv) != 3:
        raise SystemExit('Usage: validate_subtitles.py en.vtt zh.vtt')
    original, translated = (parse(p) for p in sys.argv[1:])
    if [x[0] for x in original] != [x[0] for x in translated]:
        raise ValueError(f'Cue/timestamp mismatch: original={len(original)}, translated={len(translated)}')
    print(f'PASS: {len(original)} cues, timestamps identical, no empty cues')

if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError) as exc:
        print(f'FAIL: {exc}', file=sys.stderr)
        sys.exit(1)
