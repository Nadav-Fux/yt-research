const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

/**
 * Call Groq API with key rotation.
 * Reads GROQ_KEYS (comma-separated) from env, tries each key.
 * Falls back to single GROQ_API_KEY if GROQ_KEYS is not set.
 *
 * @param {object} env - Worker env bindings
 * @param {Array} messages - Chat messages array
 * @param {object} opts - { model, temperature, max_tokens }
 * @returns {Promise<object>} Groq API response data
 */
export async function callGroqWithRotation(env, messages, opts = {}) {
  const keys = getKeys(env);
  if (keys.length === 0) {
    throw new Error('No Groq API keys configured (set GROQ_KEYS or GROQ_API_KEY)');
  }

  const model = opts.model || DEFAULT_MODEL;
  const temperature = opts.temperature ?? 0.3;
  const max_tokens = opts.max_tokens || 1500;

  let lastError = null;

  for (const key of keys) {
    try {
      const resp = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ model, messages, temperature, max_tokens }),
      });

      if (resp.status === 429) {
        // Rate limited — try next key
        lastError = new Error('Rate limited (429)');
        continue;
      }

      if (!resp.ok) {
        const errText = await resp.text();
        // On auth errors (401/403), try next key too
        if (resp.status === 401 || resp.status === 403) {
          lastError = new Error(`Auth error (${resp.status}): ${errText}`);
          continue;
        }
        throw new Error(`Groq API error ${resp.status}: ${errText}`);
      }

      return await resp.json();
    } catch (err) {
      if (err.message.startsWith('Rate limited') || err.message.startsWith('Auth error')) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('All Groq API keys exhausted');
}

function getKeys(env) {
  // Prefer GROQ_KEYS (comma-separated, supports multiple keys)
  if (env.GROQ_KEYS) {
    return env.GROQ_KEYS.split(',').map(k => k.trim()).filter(Boolean);
  }
  // Fallback to single key
  if (env.GROQ_API_KEY) {
    return [env.GROQ_API_KEY];
  }
  return [];
}

export { GROQ_URL, DEFAULT_MODEL };
