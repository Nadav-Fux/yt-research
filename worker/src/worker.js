import { corsHeaders, handleOptions } from './lib/cors.js';
import { handleListVideos, handleGetVideo } from './handlers/videos.js';
import { handleSummarize } from './handlers/summarize.js';
import { handleIngest } from './handlers/ingest.js';
import { handleExport } from './handlers/export.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method.toUpperCase();

    // CORS preflight
    if (method === 'OPTIONS') {
      return handleOptions(request);
    }

    try {
      // --- Route: GET /api/videos ---
      if (method === 'GET' && pathname === '/api/videos') {
        return await handleListVideos(request, env);
      }

      // --- Route: GET /api/videos/:id ---
      const videoMatch = pathname.match(/^\/api\/videos\/([a-zA-Z0-9_-]+)$/);
      if (method === 'GET' && videoMatch) {
        return await handleGetVideo(request, env, videoMatch[1]);
      }

      // --- Route: POST /api/summarize ---
      if (method === 'POST' && pathname === '/api/summarize') {
        return await handleSummarize(request, env);
      }

      // --- Route: POST /api/ingest ---
      if (method === 'POST' && pathname === '/api/ingest') {
        return await handleIngest(request, env);
      }

      // --- Route: GET /api/export ---
      if (method === 'GET' && pathname === '/api/export') {
        return await handleExport(request, env);
      }

      // --- Health check ---
      if (method === 'GET' && (pathname === '/' || pathname === '/health')) {
        return new Response(
          JSON.stringify({
            service: 'yt-research-api',
            status: 'ok',
            timestamp: new Date().toISOString(),
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(request.headers.get('Origin') || ''),
            },
          }
        );
      }

      // --- 404 ---
      const origin = request.headers.get('Origin') || '';
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          path: pathname,
          method,
          availableRoutes: [
            'GET  /api/videos',
            'GET  /api/videos/:id',
            'POST /api/summarize',
            'POST /api/ingest',
            'GET  /api/export',
          ],
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        }
      );
    } catch (err) {
      // --- 500 ---
      const origin = request.headers.get('Origin') || '';
      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          message: err.message || 'Unknown error',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        }
      );
    }
  },
};
