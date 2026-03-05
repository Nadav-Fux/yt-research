import { corsHeaders } from '../lib/cors.js';
import { validateToken } from '../lib/auth.js';

async function readStore(env) {
  const obj = await env.DATA_BUCKET.get('videos.json');
  if (!obj) return { videos: [], channels: {} };
  try { return await obj.json(); } catch { return { videos: [], channels: {} }; }
}

async function writeStore(env, store) {
  await env.DATA_BUCKET.put('videos.json', JSON.stringify(store));
}

function authError(origin) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

/**
 * POST /api/videos/:id/archive
 * Body: { archived: true|false } (default: toggle)
 */
export async function handleArchiveVideo(request, env, videoId) {
  const origin = request.headers.get('Origin') || '';
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(origin) };
  if (!validateToken(request, env)) return authError(origin);

  const store = await readStore(env);
  const video = (store.videos || []).find(v => v.id === videoId);
  if (!video) return new Response(JSON.stringify({ error: 'Video not found' }), { status: 404, headers });

  let body = {};
  try { body = await request.json(); } catch {}
  const archived = body.archived !== undefined ? !!body.archived : !video.archived;

  video.archived = archived;
  video.archivedAt = archived ? new Date().toISOString() : null;
  await writeStore(env, store);

  return new Response(JSON.stringify({ id: videoId, archived: video.archived, archivedAt: video.archivedAt }), { headers });
}

/**
 * DELETE /api/videos/:id
 */
export async function handleDeleteVideo(request, env, videoId) {
  const origin = request.headers.get('Origin') || '';
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(origin) };
  if (!validateToken(request, env)) return authError(origin);

  const store = await readStore(env);
  const idx = (store.videos || []).findIndex(v => v.id === videoId);
  if (idx === -1) return new Response(JSON.stringify({ error: 'Video not found' }), { status: 404, headers });

  store.videos.splice(idx, 1);
  await writeStore(env, store);

  return new Response(JSON.stringify({ id: videoId, deleted: true, remaining: store.videos.length }), { headers });
}

/**
 * POST /api/videos/batch-archive
 * Body: { ids: [...], archived: true|false }
 */
export async function handleBatchArchive(request, env) {
  const origin = request.headers.get('Origin') || '';
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(origin) };
  if (!validateToken(request, env)) return authError(origin);

  const body = await request.json();
  const ids = body.ids || [];
  const archived = body.archived !== undefined ? !!body.archived : true;
  if (!ids.length) return new Response(JSON.stringify({ error: 'No ids provided' }), { status: 400, headers });

  const store = await readStore(env);
  const idSet = new Set(ids);
  let count = 0;
  for (const v of store.videos) {
    if (idSet.has(v.id)) {
      v.archived = archived;
      v.archivedAt = archived ? new Date().toISOString() : null;
      count++;
    }
  }
  await writeStore(env, store);

  return new Response(JSON.stringify({ archived, updated: count, total: store.videos.length }), { headers });
}

/**
 * POST /api/videos/batch-delete
 * Body: { ids: [...] }
 */
export async function handleBatchDelete(request, env) {
  const origin = request.headers.get('Origin') || '';
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(origin) };
  if (!validateToken(request, env)) return authError(origin);

  const body = await request.json();
  const ids = body.ids || [];
  if (!ids.length) return new Response(JSON.stringify({ error: 'No ids provided' }), { status: 400, headers });

  const store = await readStore(env);
  const idSet = new Set(ids);
  const before = store.videos.length;
  store.videos = store.videos.filter(v => !idSet.has(v.id));
  await writeStore(env, store);

  return new Response(JSON.stringify({ deleted: before - store.videos.length, remaining: store.videos.length }), { headers });
}
