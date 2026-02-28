import { corsHeaders } from '../lib/cors.js';

const N8N_WEBHOOK = 'https://n8n.74111147.xyz/webhook/yt-scrape';

/**
 * POST /api/scrape
 *
 * Body: { topic: "search query", minDuration?: 300, maxResults?: 50 }
 *
 * Triggers the n8n workflow which:
 *  1. Searches YouTube via Apify
 *  2. Fetches transcripts
 *  3. POSTs results back to /api/ingest
 *
 * Returns immediately with { status: "started", topic }
 */
export async function handleScrape(request, env) {
  const origin = request.headers.get('Origin') || '';

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  const topic = (body.topic || '').trim();
  if (!topic) {
    return new Response(JSON.stringify({ error: 'topic is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  // Forward to n8n webhook (fire-and-forget style — n8n responds immediately)
  try {
    const n8nRes = await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        minDuration: body.minDuration || 300,
        maxResults: body.maxResults || 50,
      }),
    });

    let n8nData;
    try {
      n8nData = await n8nRes.json();
    } catch {
      n8nData = { raw: await n8nRes.text() };
    }

    return new Response(
      JSON.stringify({
        status: 'started',
        topic,
        n8n: n8nData,
      }),
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Failed to trigger scrape workflow', message: err.message }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      }
    );
  }
}
