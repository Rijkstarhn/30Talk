#!/usr/bin/env python3
"""Daily YouTube interview discovery; submit one candidate to the existing issue queue."""
import datetime as dt
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = os.environ.get('GITHUB_REPO', 'Rijkstarhn/30Talk')
QUERIES = [
    'AI technology long form interview podcast',
    'economics business investing long interview',
    'philosophy science deep conversation interview',
    'artificial intelligence research interview',
]
KEYWORDS = ('interview', 'podcast', 'conversation', 'talk', 'discussion', 'lex fridman', 'dwarkesh', 'dialogue')
TOPICS = ('ai', 'artificial intelligence', 'technology', 'economics', 'business', 'investing', 'philosophy', 'science', 'research', 'startup', 'finance')


def youtube(endpoint, params):
    params = {**params, 'key': os.environ['YOUTUBE_API_KEY']}
    url = 'https://www.googleapis.com/youtube/v3/' + endpoint + '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent': '30Talk-DailyDiscovery/1.0'})
    with urllib.request.urlopen(req, timeout=25) as response:
        return json.load(response)


def gh(*args):
    return subprocess.run(['gh', *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout


def iso_duration(value):
    m = re.fullmatch(r'P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', value)
    if not m:
        return 0
    h, mnt, sec = (int(x or 0) for x in m.groups())
    return h * 3600 + mnt * 60 + sec


def has_english_transcript(video_id):
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        tracks = YouTubeTranscriptApi().list(video_id)
        tracks.find_transcript(['en'])
        return True
    except Exception:
        return False


def run():
    if not os.environ.get('YOUTUBE_API_KEY'):
        raise RuntimeError('YOUTUBE_API_KEY missing; see docs/DAILY_DISCOVERY.md')
    dry = os.environ.get('DISCOVERY_DRY_RUN') == '1'
    today = dt.datetime.now().astimezone().date().isoformat()
    state_file = ROOT / '.daily-discovery-state.json'
    state = json.loads(state_file.read_text()) if state_file.exists() else {}
    if state.get('last_submitted') == today and not dry:
        print('A daily discovery was already submitted today')
        return
    if not re.fullmatch(r'[\w.-]+/[\w.-]+', REPO):
        raise RuntimeError('Invalid GITHUB_REPO')
    # Fetch only one search page per run to conserve YouTube API quota.
    query = QUERIES[dt.date.fromisoformat(today).toordinal() % len(QUERIES)]
    after = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=30)).isoformat(timespec='seconds').replace('+00:00', 'Z')
    search = youtube('search', {'part': 'snippet', 'type': 'video', 'videoEmbeddable': 'true',
        'videoDuration': 'long', 'order': 'relevance', 'maxResults': 35,
        'publishedAfter': after, 'q': query, 'relevanceLanguage': 'en'})
    ids = [x.get('id', {}).get('videoId') for x in search.get('items', [])]
    ids = [x for x in ids if x and re.fullmatch(r'[\w-]{11}', x)]
    if not ids:
        print('No candidates returned')
        return
    videos = youtube('videos', {'part': 'snippet,contentDetails,status,statistics', 'id': ','.join(ids)})['items']
    issues = json.loads(gh('issue', 'list', '--repo', REPO, '--state', 'all', '--limit', '1000', '--json', 'title,state,labels'))
    known = {m.group(1) for i in issues if (m := re.fullmatch(r'\[30Talk\] ([\w-]{11})', i['title']))}
    known.update(p.name for p in (ROOT / 'content').iterdir() if p.is_dir())
    scored = []
    for v in videos:
        vid = v['id']
        if vid in known:
            continue
        sn = v['snippet']
        title = sn.get('title', '')
        description = sn.get('description', '')
        words = (title + ' ' + description).lower()
        seconds = iso_duration(v['contentDetails'].get('duration', ''))
        status = v.get('status', {})
        if not (1800 <= seconds <= 10800 and status.get('embeddable', False)
                and status.get('privacyStatus') == 'public'):
            continue
        if not any(k in words for k in KEYWORDS) or not any(k in words for k in TOPICS):
            continue
        views = int(v.get('statistics', {}).get('viewCount', 0))
        score = sum(3 for k in TOPICS if k in title.lower()) + sum(1 for k in KEYWORDS if k in words)
        score += min(5, len(str(views)) - 3) if views >= 1000 else 0
        scored.append((score, vid, title))
    scored.sort(reverse=True)
    for score, vid, title in scored[:12]:
        if not has_english_transcript(vid):
            continue
        print(f'Selected: {vid} | score={score} | {title}')
        if dry:
            print('DRY RUN: No GitHub issue created')
            return
        # Recheck immediately before creation; no strict atomic guarantee.
        current = json.loads(gh('issue', 'list', '--repo', REPO, '--state', 'all', '--limit', '1000', '--json', 'title'))
        if any(i['title'] == f'[30Talk] {vid}' for i in current):
            continue
        body = f'Automatically selected by Daily Discovery on {today}.\n\nVideo: https://www.youtube.com/watch?v={vid}\nTitle: {title}\n'
        issue_url = gh('issue', 'create', '--repo', REPO, '--title', f'[30Talk] {vid}',
                       '--body', body, '--label', '30talk-request', '--label', '30talk-daily').strip()
        state['last_submitted'] = today
        state_file.write_text(json.dumps(state, indent=2) + '\n')
        print('Created:', issue_url)
        return
    print('No eligible, captioned, nonduplicate interview today')


if __name__ == '__main__':
    try:
        run()
    except (RuntimeError, subprocess.CalledProcessError, urllib.error.URLError, KeyError) as exc:
        print('Daily Discovery failed:', exc, file=sys.stderr)
        sys.exit(1)
