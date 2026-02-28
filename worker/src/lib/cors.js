const ALLOWED_ORIGINS = [
  'https://yt.nvision.me',
  'https://yt-research-6r3.pages.dev',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

/**
 * Return CORS headers for the given request origin.
 * If the origin is not in the allow-list the headers still include
 * the primary production origin so browsers see a valid (but
 * non-matching) Access-Control-Allow-Origin and block the request
 * cleanly.
 */
export function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Return a 204 response for OPTIONS preflight requests.
 */
export function handleOptions(request) {
  const origin = request.headers.get('Origin') || '';
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}
