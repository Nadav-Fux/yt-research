import { corsHeaders } from '../lib/cors.js';

/**
 * Read the canonical store from R2.
 */
async function readStore(env) {
  const obj = await env.DATA_BUCKET.get('videos.json');
  if (!obj) return { videos: [], channels: {} };
  try {
    return await obj.json();
  } catch {
    return { videos: [], channels: {} };
  }
}

/**
 * Escape a value for CSV output.
 */
function csvEscape(val) {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert videos array to CSV string (no transcripts — metadata only).
 */
function videosToCSV(videos) {
  const columns = [
    'id',
    'title',
    'url',
    'channelId',
    'date',
    'durationSeconds',
    'viewCount',
    'likes',
    'commentsCount',
    'topic',
    'searchQuery',
    'hasTranscript',
    'transcriptWordCount',
    'summaryModel',
    'ingestedAt',
  ];

  const header = columns.join(',');
  const rows = videos.map((v) => columns.map((col) => csvEscape(v[col])).join(','));

  return [header, ...rows].join('\n');
}

/**
 * Convert videos array to concatenated transcripts text.
 */
function videosToTxt(videos) {
  const parts = [];
  for (const v of videos) {
    if (!v.transcript) continue;
    parts.push(`${'='.repeat(60)}`);
    parts.push(`Title: ${v.title}`);
    parts.push(`ID: ${v.id}  |  Date: ${v.date}  |  Topic: ${v.topic}`);
    parts.push(`URL: ${v.url}`);
    parts.push(`${'='.repeat(60)}\n`);
    parts.push(v.transcript);
    parts.push('\n');
  }
  return parts.join('\n');
}

/**
 * GET /api/export
 *
 * Query params:
 *   ?format=json|csv|txt  (default: json)
 *   ?videoId=xxx           (export single video transcript as .txt)
 *   ?topic=xxx             (filter by topic)
 */
export async function handleExport(request, env) {
  const origin = request.headers.get('Origin') || '';
  const url = new URL(request.url);
  const format = (url.searchParams.get('format') || 'json').toLowerCase();
  const videoIdFilter = url.searchParams.get('videoId');
  const topicFilter = url.searchParams.get('topic');

  const store = await readStore(env);
  let videos = store.videos || [];

  // Filter by topic
  if (topicFilter) {
    videos = videos.filter((v) => v.topic === topicFilter);
  }

  // Single video transcript export
  if (videoIdFilter) {
    const video = videos.find((v) => v.id === videoIdFilter);
    if (!video) {
      return new Response(JSON.stringify({ error: 'Video not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const filename = `transcript-${video.id}.txt`;
    const body = [
      `Title: ${video.title}`,
      `URL: ${video.url}`,
      `Date: ${video.date}`,
      `Topic: ${video.topic}`,
      `Duration: ${video.durationSeconds}s`,
      '',
      '--- Transcript ---',
      '',
      video.transcript || '(no transcript available)',
      '',
      video.summary ? '--- Summary ---\n\n' + video.summary : '',
    ].join('\n');

    return new Response(body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        ...corsHeaders(origin),
      },
    });
  }

  // Full export by format
  switch (format) {
    case 'csv': {
      const csv = videosToCSV(videos);
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="yt-research-export.csv"',
          ...corsHeaders(origin),
        },
      });
    }

    case 'txt': {
      const txt = videosToTxt(videos);
      return new Response(txt, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': 'attachment; filename="yt-research-transcripts.txt"',
          ...corsHeaders(origin),
        },
      });
    }

    case 'json':
    default: {
      return new Response(JSON.stringify(store, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="yt-research-export.json"',
          ...corsHeaders(origin),
        },
      });
    }
  }
}
