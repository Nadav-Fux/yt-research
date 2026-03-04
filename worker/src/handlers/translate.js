import { corsHeaders } from '../lib/cors.js';
import { callGroqWithRotation } from '../lib/groq.js';

const MAX_CHUNK_CHARS = 24000; // ~6000 tokens
const LANG_NAMES = { he: 'Hebrew', ar: 'Arabic', ru: 'Russian', es: 'Spanish', fr: 'French', de: 'German' };

/**
 * POST /api/translate
 *
 * Body: { text, targetLang?: "he", videoId? }
 * Returns: { translated, model, chunks }
 */
export async function handleTranslate(request, env) {
  const origin = request.headers.get('Origin') || '';
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(origin) };

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers,
    });
  }

  const { text, targetLang } = body;
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'text is required' }), {
      status: 400, headers,
    });
  }

  const lang = targetLang || 'he';
  const langName = LANG_NAMES[lang] || lang;

  const systemPrompt = `Translate the following to ${langName}. Preserve markdown formatting. Output only the translation, nothing else.`;

  try {
    let translated;
    let chunkCount = 1;

    if (text.length <= MAX_CHUNK_CHARS) {
      // Single chunk
      const data = await callGroqWithRotation(env, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ], {
        temperature: 0.2,
        max_tokens: 8000,
      });
      translated = data.choices?.[0]?.message?.content || '';
    } else {
      // Multi-chunk: split on paragraph boundaries
      const chunks = splitText(text, MAX_CHUNK_CHARS);
      chunkCount = chunks.length;
      const translatedParts = [];

      for (const chunk of chunks) {
        const data = await callGroqWithRotation(env, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: chunk },
        ], {
          temperature: 0.2,
          max_tokens: 8000,
        });
        translatedParts.push(data.choices?.[0]?.message?.content || '');
      }

      translated = translatedParts.join('\n\n');
    }

    if (!translated) {
      return new Response(JSON.stringify({ error: 'Translation returned empty' }), {
        status: 502, headers,
      });
    }

    return new Response(JSON.stringify({
      translated,
      model: 'llama-3.3-70b-versatile',
      chunks: chunkCount,
    }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({
      error: 'Translation failed',
      detail: err.message,
    }), {
      status: 502, headers,
    });
  }
}

/**
 * Split text into chunks at paragraph boundaries, respecting max char limit.
 */
function splitText(text, maxChars) {
  const paragraphs = text.split(/\n{2,}/);
  const chunks = [];
  let current = '';

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxChars && current.length > 0) {
      chunks.push(current);
      current = para;
    } else {
      current += (current ? '\n\n' : '') + para;
    }
  }
  if (current) chunks.push(current);

  // If any chunk is still too long, force-split by sentences
  const result = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxChars) {
      result.push(chunk);
    } else {
      const sentences = chunk.split(/(?<=[.!?])\s+/);
      let part = '';
      for (const s of sentences) {
        if (part.length + s.length + 1 > maxChars && part.length > 0) {
          result.push(part);
          part = s;
        } else {
          part += (part ? ' ' : '') + s;
        }
      }
      if (part) result.push(part);
    }
  }

  return result;
}
