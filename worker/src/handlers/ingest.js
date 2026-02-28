import { corsHeaders } from '../lib/cors.js';
import { validateToken } from '../lib/auth.js';
import { normalizeApifyVideos } from '../lib/normalize.js';

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
 * Write the store back to R2.
 */
async function writeStore(env, store) {
  await env.DATA_BUCKET.put('videos.json', JSON.stringify(store, null, 2), {
    httpMetadata: { contentType: 'application/json' },
  });
}

/**
 * POST /api/ingest
 *
 * Body: {
 *   videos: [ ...apify format... ],
 *   topic: "openclaw"
 * }
 *
 * Protected by Bearer token (INGEST_TOKEN).
 * Normalizes incoming Apify data, merges with existing store (skip dupes),
 * writes back to R2.
 */
export async function handleIngest(request, env) {
  const origin = request.headers.get('Origin') || '';
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(origin) };

  // Auth check
  if (!validateToken(request, env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers,
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers,
    });
  }

  const { videos: incomingRaw, topic } = body;

  if (!Array.isArray(incomingRaw) || incomingRaw.length === 0) {
    return new Response(
      JSON.stringify({ error: 'videos array is required and must not be empty' }),
      { status: 400, headers }
    );
  }

  if (!topic || typeof topic !== 'string') {
    return new Response(
      JSON.stringify({ error: 'topic string is required' }),
      { status: 400, headers }
    );
  }

  // Normalize incoming data
  const { videos: incoming, channels: incomingChannels } = normalizeApifyVideos(incomingRaw, topic);

  // Read existing store
  const store = await readStore(env);
  const existingIds = new Set((store.videos || []).map((v) => v.id));

  let added = 0;
  let skipped = 0;

  for (const video of incoming) {
    if (!video.id) {
      skipped++;
      continue;
    }

    if (existingIds.has(video.id)) {
      skipped++;
      continue;
    }

    store.videos.push(video);
    existingIds.add(video.id);
    added++;
  }

  // Merge channel info (new channels get added, existing channels get updated)
  if (!store.channels) store.channels = {};
  for (const [channelId, info] of Object.entries(incomingChannels)) {
    store.channels[channelId] = {
      ...store.channels[channelId],
      ...info,
    };
  }

  // Write back
  await writeStore(env, store);

  return new Response(
    JSON.stringify({
      added,
      skipped,
      total: store.videos.length,
      totalChannels: Object.keys(store.channels).length,
    }),
    { headers }
  );
}
