/**
 * Parse a duration string ("HH:MM:SS" or "MM:SS" or "SS") into total seconds.
 * Also handles a bare integer (already seconds).
 */
function parseDuration(raw) {
  if (raw == null) return 0;
  if (typeof raw === 'number') return Math.round(raw);

  const str = String(raw).trim();
  if (!str) return 0;

  // Pure numeric string
  if (/^\d+$/.test(str)) return parseInt(str, 10);

  const parts = str.split(':').map(Number);
  if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

/**
 * Safely extract a numeric value from various Apify field shapes.
 */
function toInt(val) {
  if (val == null) return 0;
  if (typeof val === 'number') return Math.round(val);
  const n = parseInt(String(val).replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

/**
 * Derive a YouTube video ID from an Apify entry.
 * Tries `id`, `videoId`, and falls back to parsing the URL.
 */
function extractVideoId(entry) {
  if (entry.id) return String(entry.id);
  if (entry.videoId) return String(entry.videoId);

  const url = entry.url || '';
  const match = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (match) return match[1];

  // Short-URL format
  const short = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (short) return short[1];

  return '';
}

/**
 * Normalize an array of Apify-format video objects into our internal schema.
 *
 * Returns { videos: InternalVideo[], channels: Record<string, ChannelInfo> }
 */
export function normalizeApifyVideos(apifyVideos, topic) {
  const videos = [];
  const channels = {};
  const now = new Date().toISOString();

  for (const entry of apifyVideos) {
    const videoId = extractVideoId(entry);
    if (!videoId) continue;

    const channelId = entry.channelId || entry.channelUrl?.split('/').pop() || '';
    const transcript = entry.transcript || entry.subtitles || '';
    const description = (entry.description || entry.text || '').slice(0, 500);

    videos.push({
      id: videoId,
      title: entry.title || '',
      url: entry.url || `https://youtube.com/watch?v=${videoId}`,
      thumbnailUrl: entry.thumbnailUrl || entry.thumbnail || '',
      channelId,
      date: entry.date || entry.uploadDate || entry.publishedAt || now,
      durationSeconds: parseDuration(entry.duration),
      viewCount: toInt(entry.viewCount || entry.views),
      likes: toInt(entry.likes || entry.likeCount),
      commentsCount: toInt(entry.commentsCount || entry.commentCount || entry.numberOfComments),
      description,
      searchQuery: entry.searchQuery || topic || '',
      topic: topic || '',
      hasTranscript: transcript.length > 0,
      transcriptWordCount: transcript ? transcript.split(/\s+/).filter(Boolean).length : 0,
      transcript: transcript,
      summary: null,
      summaryModel: null,
      ingestedAt: now,
    });

    // Accumulate channel info (last-write wins per channel)
    if (channelId) {
      channels[channelId] = {
        name: entry.channelName || entry.channelTitle || '',
        url: entry.channelUrl || `https://youtube.com/channel/${channelId}`,
        subscribers: toInt(entry.subscriberCount || entry.channelSubscribers),
      };
    }
  }

  return { videos, channels };
}
