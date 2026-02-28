import { corsHeaders } from '../lib/cors.js';

/**
 * Read the canonical videos.json from R2.
 * Returns { videos: [], channels: {} } or a default empty shape.
 */
async function readStore(env) {
  const obj = await env.DATA_BUCKET.get('videos.json');
  if (!obj) {
    return { videos: [], channels: {} };
  }
  try {
    return await obj.json();
  } catch {
    return { videos: [], channels: {} };
  }
}

/**
 * GET /api/videos
 *
 * Query params:
 *   ?topic=xxx    — filter by topic
 *   ?q=xxx        — search title/description
 *   ?sort=date|views|likes  (default: date)
 *   ?limit=N      — max results (default: 100)
 *   ?offset=N     — pagination offset (default: 0)
 */
export async function handleListVideos(request, env) {
  const origin = request.headers.get('Origin') || '';
  const url = new URL(request.url);

  const topicFilter = url.searchParams.get('topic');
  const query = (url.searchParams.get('q') || '').toLowerCase();
  const sort = url.searchParams.get('sort') || 'date';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  const store = await readStore(env);
  let results = store.videos || [];

  // Filter by topic
  if (topicFilter) {
    results = results.filter((v) => v.topic === topicFilter);
  }

  // Search title + description
  if (query) {
    results = results.filter(
      (v) =>
        (v.title || '').toLowerCase().includes(query) ||
        (v.description || '').toLowerCase().includes(query)
    );
  }

  // Sort
  if (sort === 'views') {
    results.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
  } else if (sort === 'likes') {
    results.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  } else {
    // Default: newest first
    results.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  const total = results.length;
  results = results.slice(offset, offset + limit);

  // Strip transcripts from list view to keep payload small
  const lite = results.map(({ transcript, ...rest }) => rest);

  return new Response(
    JSON.stringify({ videos: lite, channels: store.channels || {}, total, offset, limit }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        ...corsHeaders(origin),
      },
    }
  );
}

/**
 * GET /api/videos/:id
 *
 * Returns a single video with full transcript.
 */
export async function handleGetVideo(request, env, videoId) {
  const origin = request.headers.get('Origin') || '';
  const store = await readStore(env);
  const video = (store.videos || []).find((v) => v.id === videoId);

  if (!video) {
    return new Response(JSON.stringify({ error: 'Video not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  // Include channel info if available
  const channel = video.channelId ? (store.channels || {})[video.channelId] : null;

  return new Response(JSON.stringify({ video, channel }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
      ...corsHeaders(origin),
    },
  });
}
