#!/usr/bin/env python3
"""30Talk Daily Discovery: curated interview sources, exceptional guests, no forced posts.

Drop-in replacement for scripts/daily_discovery.py. Uses the existing
YOUTUBE_API_KEY, GITHUB_REPO, DISCOVERY_DRY_RUN and gh issue queue.
"""
import datetime as dt
import json
import math
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

# Only these official YouTube handles are eligible. The YouTube API resolves
# each handle to an immutable channel ID; videos are checked against that ID.
# On successive days, alternate between the first two and the last two sources.
CURATED_CHANNELS = (
    ('Stanford Graduate School of Business', '@stanfordgsb', 'View From The Top'),
    ('Bloomberg Originals', '@bloombergoriginals', 'The Circuit'),
    ('Y Combinator', '@ycombinator', 'interview'),
    ('Talks at Google', '@talksatgoogle', 'interview'),
)

# Stage-one editorial guest shortlist. Require an actual name match (in video
# title or the beginning of the description), not just generic keywords.
# Extend this list over time when you decide to feature more guests.
FEATURED_GUESTS = (
    'Sam Altman', 'Jensen Huang', 'Satya Nadella', 'Sundar Pichai',
    'Demis Hassabis', 'Dario Amodei', 'Daniela Amodei', 'Fei-Fei Li',
    'Andrew Ng', 'Geoffrey Hinton', 'Yann LeCun', 'Ilya Sutskever',
    'Jeff Bezos', 'Bill Gates', 'Tim Cook', 'Steve Jobs', 'Elon Musk',
    'Sergey Brin', 'Larry Page', 'Lisa Su', 'John Carmack',
    'Paul Graham', 'Brian Chesky', 'Patrick Collison', 'John Collison',
    'Reid Hoffman', 'Marc Andreessen', 'Peter Thiel', 'Naval Ravikant',
    'Garry Tan', 'Michael Seibel', 'Drew Houston', 'Dustin Moskovitz',
    'Mark Zuckerberg', 'Reed Hastings', 'Sheryl Sandberg',
    'Ray Dalio', 'Warren Buffett', 'Charlie Munger', 'Howard Marks',
    'Jamie Dimon', 'Michael Bloomberg', 'David Rubenstein',
    'Jennifer Doudna', 'David Baker', 'George Church', 'David Silver',
    'Yuval Noah Harari', 'Daniel Kahneman', 'Daron Acemoglu',
    'Esther Duflo', 'Nassim Nicholas Taleb', 'Thomas Piketty',
    'Richard Dawkins', 'Steven Pinker', 'David Deutsch', 'Nick Bostrom',
    'Daniel Dennett', 'Tim Ferriss', 'Adam Grant', 'Walter Isaacson',
    'Michael Lewis',
)

INTERVIEW_SIGNALS = (
    'interview', 'conversation', 'fireside chat', 'q&a', 'q & a',
    'moderated by', 'in conversation', 'sits down with', 'talks with',
    'speaks with', 'podcast', 'view from the top', 'the circuit',
    'the david rubenstein show', 'interviewed by',
)
REJECT_SIGNALS = (
    'trailer', 'teaser', 'highlights', 'highlight reel', 'best of',
    'shorts', 'compilation', 'recap', 'keynote', 'full lecture',
    'workshop', 'panel discussion', 'livestream',
)
MIN_SECONDS = 15 * 60
MAX_SECONDS = 60 * 60
PREFERRED_MIN_SECONDS = 20 * 60
PREFERRED_MAX_SECONDS = 45 * 60
MIN_VIDEO_VIEWS = int(os.environ.get('DISCOVERY_MIN_VIEWS', '20000'))
MIN_CHANNEL_SUBSCRIBERS = int(os.environ.get('DISCOVERY_MIN_SUBSCRIBERS', '100000'))


def youtube(endpoint, params):
    url = 'https://www.googleapis.com/youtube/v3/' + endpoint + '?' + urllib.parse.urlencode(
        {**params, 'key': os.environ['YOUTUBE_API_KEY']}
    )
    req = urllib.request.Request(url, headers={'User-Agent': '30Talk-DailyDiscovery/2.0'})
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read(600).decode('utf-8', errors='replace')
        raise RuntimeError(f'YouTube API {endpoint}: HTTP {exc.code}: {detail}') from exc


def gh(*args):
    result = subprocess.run(['gh', *args], cwd=ROOT, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f'GitHub CLI error: {result.stderr.strip() or result.stdout.strip()}')
    return result.stdout


def iso_duration(value):
    match = re.fullmatch(r'P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?', value)
    if not match:
        return 0
    days, hours, minutes, seconds = (int(x or 0) for x in match.groups())
    return days * 86400 + hours * 3600 + minutes * 60 + seconds


def text_mentions(text, phrase):
    """Match full guest name to avoid e.g. 'ai' inside 'chair'."""
    return bool(re.search(r'(?<!\w)' + re.escape(phrase) + r'(?!\w)', text, re.I))


def known_video_ids():
    issues = json.loads(gh('issue', 'list', '--repo', REPO, '--state', 'all',
                           '--limit', '1000', '--json', 'title'))
    ids = {
        match.group(1) for issue in issues
        if (match := re.fullmatch(r'\[30Talk\] ([A-Za-z0-9_-]{11})', issue.get('title', '')))
    }
    content_dir = ROOT / 'content'
    if content_dir.is_dir():
        ids.update(p.name for p in content_dir.iterdir() if p.is_dir())
    return ids


def resolve_channel(name, handle):
    data = youtube('channels', {
        'part': 'id,snippet,statistics', 'forHandle': handle,
    })
    items = data.get('items', [])
    if len(items) != 1:
        raise RuntimeError(f'Cannot resolve official YouTube channel {name} ({handle})')
    channel = items[0]
    subscribers = int(channel.get('statistics', {}).get('subscriberCount', 0))
    if subscribers < MIN_CHANNEL_SUBSCRIBERS:
        print(f'Skipping {name}: channel subscriber count {subscribers:,} < {MIN_CHANNEL_SUBSCRIBERS:,}')
        return None
    return channel['id']


def candidates_for_channel(name, handle, query):
    channel_id = resolve_channel(name, handle)
    if not channel_id:
        return []
    # Long-form only in API search (>20 minutes), then exact 15–60m check below.
    # No publishedAfter: classic interviews remain eligible.
    results = youtube('search', {
        'part': 'snippet', 'type': 'video', 'channelId': channel_id,
        'videoEmbeddable': 'true', 'videoDuration': 'long',
        'order': 'viewCount', 'maxResults': 50, 'q': query,
    })
    ids = [x.get('id', {}).get('videoId') for x in results.get('items', [])]
    ids = [vid for vid in ids if vid and re.fullmatch(r'[\w-]{11}', vid)]
    if not ids:
        print(f'No long-form search results from {name}')
        return []
    details = youtube('videos', {
        'part': 'snippet,contentDetails,status,statistics', 'id': ','.join(ids),
    })
    # Defense in depth: ensure uploader is exactly the approved channel.
    return [(name, video) for video in details.get('items', [])
            if video.get('snippet', {}).get('channelId') == channel_id]


def scored_video(name, video, known):
    vid = video['id']
    if vid in known:
        return None
    snippet = video.get('snippet', {})
    title = snippet.get('title', '')
    description = snippet.get('description', '')
    seconds = iso_duration(video.get('contentDetails', {}).get('duration', ''))
    status = video.get('status', {})
    if not (MIN_SECONDS <= seconds <= MAX_SECONDS):
        return None
    if not status.get('embeddable', False) or status.get('privacyStatus') != 'public':
        return None
    views = int(video.get('statistics', {}).get('viewCount', 0))
    if views < MIN_VIDEO_VIEWS:
        return None
    lowered_title = title.lower()
    if any(signal in lowered_title for signal in REJECT_SIGNALS):
        return None
    # Descriptions may have boilerplate links/other celebrities at the bottom.
    heading = (title + ' ' + description[:320]).lower()
    if not any(signal in heading for signal in INTERVIEW_SIGNALS):
        return None
    guest = next((person for person in FEATURED_GUESTS
                  if text_mentions(title, person)), None)
    if guest is None:
        guest = next((person for person in FEATURED_GUESTS
                      if text_mentions(description[:240], person)), None)
    if guest is None:
        return None  # Editorial priority: top guests or skip the day.
    preferred = PREFERRED_MIN_SECONDS <= seconds <= PREFERRED_MAX_SECONDS
    score = (20 + (8 if preferred else 0) +
             min(12, max(0, round(math.log10(max(1, views)) * 2))) +
             (3 if text_mentions(title, guest) else 0) +
             (2 if any(x in lowered_title for x in ('interview', 'conversation', 'view from the top', 'the circuit')) else 0))
    return {
        'id': vid, 'title': title, 'channel': name, 'guest': guest,
        'seconds': seconds, 'views': views, 'score': score,
    }


def has_english_transcript(video_id):
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        YouTubeTranscriptApi().list(video_id).find_transcript(['en'])
        return True
    except Exception:
        return False


def run():
    if not os.environ.get('YOUTUBE_API_KEY'):
        raise RuntimeError('YOUTUBE_API_KEY missing; see docs/DAILY_DISCOVERY.md')
    if not re.fullmatch(r'[\w.-]+/[\w.-]+', REPO):
        raise RuntimeError('Invalid GITHUB_REPO')
    dry = os.environ.get('DISCOVERY_DRY_RUN') == '1'
    today = dt.datetime.now().astimezone().date().isoformat()
    state_file = ROOT / '.daily-discovery-state.json'
    state = json.loads(state_file.read_text(encoding='utf-8')) if state_file.exists() else {}
    if state.get('last_submitted') == today and not dry:
        print('A daily discovery was already submitted today')
        return

    known = known_video_ids()
    # Rotate two curated channels per day, rather than searching all YouTube.
    start = dt.date.fromisoformat(today).toordinal() % 2
    sources = CURATED_CHANNELS[:2] if start == 0 else CURATED_CHANNELS[2:]
    print('Curated sources today:', ', '.join(name for name, _, _ in sources))
    shortlisted = []
    for name, handle, query in sources:
        for source, video in candidates_for_channel(name, handle, query):
            item = scored_video(source, video, known)
            if item:
                shortlisted.append(item)
    shortlisted.sort(key=lambda x: (x['score'], x['views']), reverse=True)
    if not shortlisted:
        print('No exceptional eligible interview today; no issue created')
        return

    for item in shortlisted[:10]:
        vid = item['id']
        if not has_english_transcript(vid):
            continue
        duration = f"{item['seconds'] // 60}m"
        print(f"Selected: {vid} | {item['channel']} | {item['guest']} | {duration} "
              f"| {item['views']:,} views | score={item['score']} | {item['title']}")
        if dry:
            print('DRY RUN: No GitHub issue created')
            return
        # Recheck before creating an issue to reduce duplicate submissions.
        if vid in known_video_ids():
            continue
        body = (
            f'Automatically selected by curated Daily Discovery on {today}.\n\n'
            f'Video: https://www.youtube.com/watch?v={vid}\n'
            f'Title: {item["title"]}\nChannel: {item["channel"]}\n'
            f'Guest: {item["guest"]}\nDuration: {duration}\n'
            f'Views at selection: {item["views"]:,}\n'
        )
        issue_url = gh('issue', 'create', '--repo', REPO,
                       '--title', f'[30Talk] {vid}', '--body', body,
                       '--label', '30talk-request', '--label', '30talk-daily').strip()
        state['last_submitted'] = today
        state['last_video_id'] = vid
        state_file.write_text(json.dumps(state, indent=2) + '\n', encoding='utf-8')
        print('Created:', issue_url)
        return
    print('No eligible English-captioned interview today; no issue created')


if __name__ == '__main__':
    try:
        run()
    except (RuntimeError, urllib.error.URLError, KeyError, ValueError, json.JSONDecodeError) as exc:
        print('Daily Discovery failed:', exc, file=sys.stderr)
        sys.exit(1)
