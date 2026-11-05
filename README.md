# 30Talk English UI + Daily Discovery (incremental patch)

Merge folders into the existing 30Talk repository; do not replace the entire repository or delete existing files. Changes are based on the supplied `30Talk-main.zip`.

- Removes top-right GitHub link.
- English UI and API messages (Chinese interview subtitle content remains unchanged).
- Adds a homepage Daily Discovery feature panel.
- Adds daily YouTube discovery at 09:00 Mac local time, using YouTube Data API and GitHub Issues.
- Uses the existing Mac mini Codex queue to translate and publish selected interviews.

**Read `docs/DAILY_DISCOVERY.md` before enabling the scheduled job.**

The discovery code uses heuristic metadata scoring, **not** full-transcript AI ranking. No live API calls or macOS launchd execution were performed here. Python syntax and catalog generation were checked. `npm ci` timed out in this environment; run `npm ci && npm run build` on your Mac before deploying.

This patch does not implement Vimeo or TED support; the provided repository only contains YouTube-specific ingestion.
