# Daily Discovery installation

This update is built against the uploaded `30Talk-main.zip` snapshot. It does **not** add Vimeo or TED ingestion; the existing processing pipeline is YouTube-only.

## Requirements

- Mac mini logged in, awake and online, with existing `com.30talk.queue` launch agent running.
- GitHub CLI (`gh`) authenticated, Codex CLI authenticated, Python venv with `youtube-transcript-api` installed.
- YouTube Data API v3 enabled, with an API key. Search uses API quota and may incur costs depending on the Google Cloud project configuration. Check quotas and billing in Google Cloud.
- GitHub Issues labels `30talk-request` and `30talk-daily` must exist. Create the new one with `gh label create 30talk-daily --repo Rijkstarhn/30Talk --color 2F81F7`.

## Setup

1. Merge the patch files into `~/4Fun/30Talk/`, preserving all other project files. Do not replace the entire `scripts/` directory.
2. `mkdir -p ~/.config/30talk && chmod 700 ~/.config/30talk`
3. Create `~/.config/30talk/discovery.env` with `YOUTUBE_API_KEY=YOUR_KEY` and `GITHUB_REPO=Rijkstarhn/30Talk`; then `chmod 600 ~/.config/30talk/discovery.env`. Do not commit this file.
4. `chmod +x scripts/run_daily_discovery.sh scripts/install_daily_discovery.sh scripts/process_video.sh scripts/poll_queue.sh`
5. `gh label create 30talk-daily --repo Rijkstarhn/30Talk --color 2F81F7` (skip if already exists).
6. Test: `DISCOVERY_DRY_RUN=1 ./scripts/run_daily_discovery.sh` (does not submit).
7. Deploy UI: `npm ci && npm run build`, then commit and push changed files to `main` for Cloudflare Pages.
8. Install scheduling: `./scripts/install_daily_discovery.sh`. Runs at **09:00 Mac local time**, while logged in and awake.
9. Test real submission: `./scripts/run_daily_discovery.sh` (creates up to one GitHub issue, if an eligible video exists). Watch `logs/discovery.log` and `logs/queue.log`.

## Limitations

- Quality ranking uses YouTube metadata, not a full AI review of transcripts. A day may have no eligible recommendation.
- One candidate is submitted per day (not guaranteed published); publication depends on subtitles, Codex, GitHub, and Cloudflare.
- The `Today’s Perspective` block shows the most recently marked daily pick, or the first published interview if none has been marked. It is not guaranteed to be published today.
- GitHub Issues `--limit 1000` provides bounded history, not unlimited lifetime deduplication; content folders are also checked. Simultaneous submissions may still race.
- YouTube transcript access is not guaranteed and may be restricted by YouTube or the publisher.
- `daily_pick_date` records processing date in Mac local time. Existing videos without it are shown as regular interviews.
- `launchd` calendar tasks may be delayed while asleep or logged out. Check logs.
