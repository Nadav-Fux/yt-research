import { corsHeaders } from '../lib/cors.js';

const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';

/**
 * GET /api/groq-status
 *
 * Checks rate limit headers for each Groq key by hitting the /models endpoint.
 * Returns remaining tokens/requests for each key.
 */
export async function handleGroqStatus(request, env) {
  const origin = request.headers.get('Origin') || '';
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(origin) };

  const keys = [];
  if (env.GROQ_KEYS) {
    env.GROQ_KEYS.split(',').map(k => k.trim()).filter(Boolean).forEach(k => keys.push(k));
  } else if (env.GROQ_API_KEY) {
    keys.push(env.GROQ_API_KEY);
  }

  if (keys.length === 0) {
    return new Response(JSON.stringify({ error: 'No Groq keys configured' }), { status: 500, headers });
  }

  const results = [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const label = 'Key ' + (i + 1) + ' (' + key.slice(0, 8) + '...)';

    try {
      const resp = await fetch(GROQ_MODELS_URL, {
        headers: { Authorization: `Bearer ${key}` },
      });

      const rateLimits = {
        label,
        status: resp.ok ? 'active' : 'error',
        httpStatus: resp.status,
        requestsLimit: resp.headers.get('x-ratelimit-limit-requests'),
        requestsRemaining: resp.headers.get('x-ratelimit-remaining-requests'),
        requestsReset: resp.headers.get('x-ratelimit-reset-requests'),
        tokensLimit: resp.headers.get('x-ratelimit-limit-tokens'),
        tokensRemaining: resp.headers.get('x-ratelimit-remaining-tokens'),
        tokensReset: resp.headers.get('x-ratelimit-reset-tokens'),
      };

      results.push(rateLimits);
    } catch (err) {
      results.push({ label, status: 'error', error: err.message });
    }
  }

  return new Response(JSON.stringify({
    keys: results,
    totalKeys: keys.length,
    timestamp: new Date().toISOString(),
  }), { headers });
}
