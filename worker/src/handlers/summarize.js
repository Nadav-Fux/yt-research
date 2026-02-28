import { corsHeaders } from '../lib/cors.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';
const MAX_TRANSCRIPT_CHARS = 28000;

const SYSTEM_PROMPT = `You are a research assistant. Summarize this YouTube video transcript in 3-5 concise paragraphs. Include:
- Main topics covered
- Key insights and claims made
- Practical takeaways or action items

Be precise and factual. Do not add information that isn't in the transcript.`;

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
 * POST /api/summarize
 *
 * Body: { videoId: "xxx" }
 *
 * Checks for a cached summary first. If none, calls Groq to generate one,
 * saves it back to R2, and returns the result.
 */
export async function handleSummarize(request, env) {
  const origin = request.headers.get('Origin') || '';
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(origin) };

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers,
    });
  }

  const { videoId } = body;
  if (!videoId) {
    return new Response(JSON.stringify({ error: 'videoId is required' }), {
      status: 400,
      headers,
    });
  }

  const store = await readStore(env);
  const idx = (store.videos || []).findIndex((v) => v.id === videoId);

  if (idx === -1) {
    return new Response(JSON.stringify({ error: 'Video not found' }), {
      status: 404,
      headers,
    });
  }

  const video = store.videos[idx];

  // Return cached summary if available
  if (video.summary) {
    return new Response(
      JSON.stringify({
        videoId: video.id,
        summary: video.summary,
        model: video.summaryModel,
        cached: true,
      }),
      { headers }
    );
  }

  // Need a transcript to summarize
  if (!video.transcript || video.transcript.trim().length === 0) {
    return new Response(
      JSON.stringify({ error: 'No transcript available for this video' }),
      { status: 422, headers }
    );
  }

  // Call Groq
  if (!env.GROQ_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'GROQ_API_KEY not configured' }),
      { status: 500, headers }
    );
  }

  const transcript = video.transcript.slice(0, MAX_TRANSCRIPT_CHARS);

  let groqResponse;
  try {
    groqResponse = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Please summarize this transcript from the video "${video.title}":\n\n${transcript}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      }),
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Failed to reach Groq API', detail: err.message }),
      { status: 502, headers }
    );
  }

  if (!groqResponse.ok) {
    const errText = await groqResponse.text();
    return new Response(
      JSON.stringify({
        error: 'Groq API error',
        status: groqResponse.status,
        detail: errText,
      }),
      { status: 502, headers }
    );
  }

  const groqData = await groqResponse.json();
  const summary = groqData.choices?.[0]?.message?.content || '';

  if (!summary) {
    return new Response(
      JSON.stringify({ error: 'Groq returned an empty summary' }),
      { status: 502, headers }
    );
  }

  // Save summary back to R2
  store.videos[idx].summary = summary;
  store.videos[idx].summaryModel = MODEL;
  await writeStore(env, store);

  return new Response(
    JSON.stringify({
      videoId: video.id,
      summary,
      model: MODEL,
      cached: false,
    }),
    { headers }
  );
}
