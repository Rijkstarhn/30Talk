#!/usr/bin/env python3
"""Translate VTT in resumable batches with Codex CLI."""
import argparse
import hashlib
import os
import re
import subprocess
import sys
from pathlib import Path
from validate_subtitles import cues, validate


def write_vtt(path, items):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('WEBVTT\n\n' + '\n\n'.join(t + '\n' + body for t, body in items) + '\n', encoding='utf-8')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('english', type=Path)
    ap.add_argument('chinese', type=Path)
    ap.add_argument('--batch-size', type=int, default=80)
    args = ap.parse_args()
    if not 1 <= args.batch_size <= 150:
        ap.error('batch size must be between 1 and 150')
    source = cues(args.english)
    digest = hashlib.sha256(args.english.read_bytes()).hexdigest()[:16]
    work = args.chinese.parent / '.translation-work' / digest
    work.mkdir(parents=True, exist_ok=True)
    combined = []
    total = (len(source) + args.batch_size - 1) // args.batch_size
    for n, start in enumerate(range(0, len(source), args.batch_size), 1):
        group = source[start:start + args.batch_size]
        en = work / f'{n:03d}.en.vtt'
        zh = work / f'{n:03d}.zh.vtt'
        write_vtt(en, group)
        if zh.exists():
            try:
                validate(en, zh)
                print(f'Batch {n}/{total}: reuse validated translation', flush=True)
                combined.extend(cues(zh))
                continue
            except (ValueError, OSError):
                zh.unlink()
        print(f'Batch {n}/{total}: translating {len(group)} cues', flush=True)
        prompt = (
            f'Translate ALL subtitle text in {en} to natural Simplified Chinese. '
            f'Write the complete translated WebVTT to {zh}. '
            'Preserve every timestamp line EXACTLY, including cue order and number. '
            'Do not change, remove, or add cues. Preserve names and meaning. '
            'Only modify the Chinese output file, never the English input. '
            'No explanations or summaries; create the output file.'
        )
        try:
            subprocess.run(['codex', 'exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', prompt], check=True)
            validate(en, zh)
        except (subprocess.CalledProcessError, ValueError, OSError) as exc:
            zh.unlink(missing_ok=True)
            sys.exit(f'Batch {n}/{total} failed: {exc}. Previous batches are saved; rerun to resume.')
        combined.extend(cues(zh))
    staged = args.chinese.with_suffix('.vtt.tmp')
    write_vtt(staged, combined)
    try:
        validate(args.english, staged)
        os.replace(staged, args.chinese)
    finally:
        staged.unlink(missing_ok=True)
    print(f'Completed {len(combined)} cues in {total} batches: {args.chinese}', flush=True)


if __name__ == '__main__':
    main()
