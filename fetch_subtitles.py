import sys
from pathlib import Path
from youtube_transcript_api import YouTubeTranscriptApi

video_id = sys.argv[1]
api = YouTubeTranscriptApi()

transcripts = api.list(video_id)

try:
    transcript = transcripts.find_manually_created_transcript(["en"])
except Exception:
    transcript = transcripts.find_generated_transcript(["en"])

items = transcript.fetch().to_raw_data()

def timestamp(seconds):
    milliseconds = round(seconds * 1000)
    hours, remainder = divmod(milliseconds, 3600000)
    minutes, remainder = divmod(remainder, 60000)
    secs, ms = divmod(remainder, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02}.{ms:03}"

lines = ["WEBVTT", ""]

for item in items:
    start = item["start"]
    end = start + item["duration"]
    text = item["text"].replace("\n", " ").strip()

    if not text:
        continue

    lines.append(f"{timestamp(start)} --> {timestamp(end)}")
    lines.append(text)
    lines.append("")

Path("en.vtt").write_text(
    "\n".join(lines),
    encoding="utf-8"
)

print(f"Saved en.vtt with {len(items)} transcript entries")
