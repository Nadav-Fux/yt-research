import { corsHeaders, handleOptions } from './lib/cors.js';
import { handleListVideos, handleGetVideo } from './handlers/videos.js';
import { handleSummarize } from './handlers/summarize.js';
import { handleIngest } from './handlers/ingest.js';
import { handleExport } from './handlers/export.js';
import { handleScrape } from './handlers/scrape.js';
import { handleListPrompts, handleCreatePrompt, handleUpdatePrompt, handleDeletePrompt } from './handlers/prompts.js';
import { handleTranslate } from './handlers/translate.js';
import { handleGroqStatus } from './handlers/groqStatus.js';
import { handleArchiveVideo, handleDeleteVideo, handleBatchArchive, handleBatchDelete } from './handlers/archive.js';

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

      // --- Route: POST /api/videos/batch-archive ---
      if (method === 'POST' && pathname === '/api/videos/batch-archive') {
        return await handleBatchArchive(request, env);
      }

      // --- Route: POST /api/videos/batch-delete ---
      if (method === 'POST' && pathname === '/api/videos/batch-delete') {
        return await handleBatchDelete(request, env);
      }

      // --- Route: POST /api/videos/:id/archive ---
      const archiveMatch = pathname.match(/^\/api\/videos\/([a-zA-Z0-9_-]+)\/archive$/);
      if (method === 'POST' && archiveMatch) {
        return await handleArchiveVideo(request, env, archiveMatch[1]);
      }

      // --- Route: GET /api/videos/:id ---
      const videoMatch = pathname.match(/^\/api\/videos\/([a-zA-Z0-9_-]+)$/);
      if (method === 'GET' && videoMatch) {
        return await handleGetVideo(request, env, videoMatch[1]);
      }

      // --- Route: DELETE /api/videos/:id ---
      if (method === 'DELETE' && videoMatch) {
        return await handleDeleteVideo(request, env, videoMatch[1]);
      }

      // --- Route: POST /api/summarize ---
      if (method === 'POST' && pathname === '/api/summarize') {
        return await handleSummarize(request, env);
      }

      // --- Route: POST /api/translate ---
      if (method === 'POST' && pathname === '/api/translate') {
        return await handleTranslate(request, env);
      }

      // --- Route: POST /api/ingest ---
      if (method === 'POST' && pathname === '/api/ingest') {
        return await handleIngest(request, env);
      }

      // --- Route: GET /api/groq-status ---
      if (method === 'GET' && pathname === '/api/groq-status') {
        return await handleGroqStatus(request, env);
      }

      // --- Route: GET /api/export ---
      if (method === 'GET' && pathname === '/api/export') {
        return await handleExport(request, env);
      }

      // --- Route: POST /api/scrape ---
      if (method === 'POST' && pathname === '/api/scrape') {
        return await handleScrape(request, env);
      }

      // --- Route: GET /api/prompts ---
      if (method === 'GET' && pathname === '/api/prompts') {
        return await handleListPrompts(request, env);
      }

      // --- Route: POST /api/prompts ---
      if (method === 'POST' && pathname === '/api/prompts') {
        return await handleCreatePrompt(request, env);
      }

      // --- Routes: PUT|DELETE /api/prompts/:id ---
      const promptMatch = pathname.match(/^\/api\/prompts\/([a-zA-Z0-9_-]+)$/);
      if (promptMatch) {
        if (method === 'PUT') {
          return await handleUpdatePrompt(request, env, promptMatch[1]);
        }
        if (method === 'DELETE') {
          return await handleDeletePrompt(request, env, promptMatch[1]);
        }
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
            'POST /api/translate',
            'POST /api/ingest',
            'POST /api/scrape',
            'GET  /api/groq-status',
            'GET  /api/export',
            'GET  /api/prompts',
            'POST /api/prompts',
            'PUT  /api/prompts/:id',
            'DELETE /api/prompts/:id',
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
