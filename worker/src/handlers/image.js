import { corsHeaders } from '../lib/cors.js';

export async function handleImage(request, env) {
  const origin = request.headers.get('Origin') || '';
  const url = new URL(request.url);
  const prompt = url.searchParams.get('prompt');
  const seed = parseInt(url.searchParams.get('seed') || '0', 10);

  if (!prompt) {
    return new Response(JSON.stringify({ error: 'Missing prompt parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  // Check R2 cache first
  const cacheKey = await hashKey(prompt + ':' + seed);
  const cached = await env.DATA_BUCKET.get('images/' + cacheKey + '.png');
  if (cached) {
    return new Response(cached.body, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=604800',
        'X-Cache': 'HIT',
        ...corsHeaders(origin),
      },
    });
  }

  // Generate via CF Workers AI
  const inputs = {
    prompt: prompt,
    num_steps: 20,
  };
  if (seed > 0) inputs.seed = seed;

  const response = await env.AI.run(
    '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    inputs
  );

  // Cache in R2
  const imageBytes = new Uint8Array(await new Response(response).arrayBuffer());
  await env.DATA_BUCKET.put('images/' + cacheKey + '.png', imageBytes, {
    httpMetadata: { contentType: 'image/png' },
  });

  return new Response(imageBytes, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=604800',
      'X-Cache': 'MISS',
      ...corsHeaders(origin),
    },
  });
}

async function hashKey(str) {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
