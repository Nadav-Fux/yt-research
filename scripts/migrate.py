#!/usr/bin/env python3
"""Migrate Apify YouTube scraper data to normalized R2 schema."""

import json
from datetime import datetime, timezone

INPUT_FILE = "/root/scripts/openclaw_youtube_results.json"
OUTPUT_FILE = "/root/yt-research/data/videos.json"


def parse_duration(duration_str):
    """Parse HH:MM:SS or MM:SS to total seconds."""
    if not duration_str:
        return 0
    parts = duration_str.split(":")
    parts = [int(p) for p in parts]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    elif len(parts) == 2:
        return parts[0] * 60 + parts[1]
    return 0


def count_words(text):
    """Count words in a string."""
    if not text:
        return 0
    return len(text.split())


def main():
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        raw = json.load(f)

    print(f"Loaded {len(raw)} videos from Apify data")

    channels = {}
    videos = []

    for entry in raw:
        # Build channel record
        ch_id = entry.get("channelId", "")
        if ch_id and ch_id not in channels:
            channels[ch_id] = {
                "name": entry.get("channelName", ""),
                "url": entry.get("channelUrl", ""),
                "username": entry.get("channelUsername", ""),
                "subscribers": entry.get("numberOfSubscribers", 0),
            }

        # Parse transcript
        transcript = entry.get("_transcript", "") or ""
        has_transcript = bool(transcript.strip())
        transcript_word_count = count_words(transcript)

        # Parse description (first 500 chars)
        full_text = entry.get("text", "") or ""
        description = full_text[:500]

        # Duration
        duration_seconds = parse_duration(entry.get("duration", ""))

        # Map search query to topic
        search_query = entry.get("_searchQuery", "") or ""
        topic = "openclaw"  # all queries map to openclaw topic

        video = {
            "id": entry.get("id", ""),
            "title": entry.get("title", ""),
            "url": entry.get("url", ""),
            "thumbnailUrl": entry.get("thumbnailUrl", ""),
            "date": entry.get("date", ""),
            "viewCount": entry.get("viewCount", 0),
            "likes": entry.get("likes", 0),
            "commentsCount": entry.get("commentsCount", 0),
            "description": description,
            "channelId": ch_id,
            "duration": entry.get("duration", ""),
            "durationSeconds": duration_seconds,
            "topic": topic,
            "searchQuery": search_query,
            "hasTranscript": has_transcript,
            "transcriptWordCount": transcript_word_count,
            "transcript": transcript,
            "summary": None,
            "summaryModel": None,
        }
        videos.append(video)

    # Sort by date descending
    videos.sort(key=lambda v: v.get("date", ""), reverse=True)

    output = {
        "version": "1",
        "lastUpdated": datetime.now(timezone.utc).isoformat(),
        "topics": {
            "openclaw": {
                "label": "OpenClaw",
                "queries": ["openclaw", "open claw"],
                "color": "#06b6d4",
            }
        },
        "channels": channels,
        "videos": videos,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    file_size = len(json.dumps(output, ensure_ascii=False))
    print(f"Output: {len(videos)} videos, {len(channels)} channels")
    print(f"Transcripts: {sum(1 for v in videos if v['hasTranscript'])} videos have transcripts")
    print(f"Total transcript words: {sum(v['transcriptWordCount'] for v in videos):,}")
    print(f"File size: {file_size:,} bytes ({file_size / 1024 / 1024:.1f} MB)")
    print(f"Written to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
