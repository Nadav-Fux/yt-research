import { corsHeaders } from '../lib/cors.js';

/**
 * Read prompts.json from R2.
 */
async function readPrompts(env) {
  const obj = await env.DATA_BUCKET.get('prompts.json');
  if (!obj) return { prompts: [], defaultPromptId: null };
  try {
    return await obj.json();
  } catch {
    return { prompts: [], defaultPromptId: null };
  }
}

/**
 * Write prompts.json back to R2.
 */
async function writePrompts(env, store) {
  await env.DATA_BUCKET.put('prompts.json', JSON.stringify(store, null, 2), {
    httpMetadata: { contentType: 'application/json' },
  });
}

/**
 * Generate a simple UUID v4.
 */
function uuid() {
  return crypto.randomUUID();
}

/**
 * GET /api/prompts
 *
 * Returns { prompts: [...], defaultPromptId: string|null }
 */
export async function handleListPrompts(request, env) {
  const origin = request.headers.get('Origin') || '';
  const store = await readPrompts(env);

  return new Response(JSON.stringify(store), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}

/**
 * POST /api/prompts
 *
 * Body: { name: string, text: string, isDefault?: boolean }
 * Creates a new prompt with a generated UUID.
 */
export async function handleCreatePrompt(request, env) {
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

  const { name, text, isDefault } = body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return new Response(JSON.stringify({ error: 'name is required' }), {
      status: 400,
      headers,
    });
  }

  if (!text || typeof text !== 'string' || !text.trim()) {
    return new Response(JSON.stringify({ error: 'text is required' }), {
      status: 400,
      headers,
    });
  }

  const store = await readPrompts(env);
  const id = uuid();
  const prompt = {
    id,
    name: name.trim(),
    text: text.trim(),
    isDefault: !!isDefault,
    createdAt: new Date().toISOString(),
  };

  store.prompts.push(prompt);

  if (isDefault) {
    // Clear other defaults and set this one
    store.prompts.forEach((p) => {
      if (p.id !== id) p.isDefault = false;
    });
    store.defaultPromptId = id;
  }

  await writePrompts(env, store);

  return new Response(JSON.stringify({ prompt }), {
    status: 201,
    headers,
  });
}

/**
 * PUT /api/prompts/:id
 *
 * Body: { name?, text?, isDefault? }
 * Updates an existing prompt.
 */
export async function handleUpdatePrompt(request, env, promptId) {
  const origin = request.headers.get('Origin') || '';
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(origin) };

  const store = await readPrompts(env);
  const idx = store.prompts.findIndex((p) => p.id === promptId);

  if (idx === -1) {
    return new Response(JSON.stringify({ error: 'Prompt not found' }), {
      status: 404,
      headers,
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers,
    });
  }

  const { name, text, isDefault } = body;

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return new Response(JSON.stringify({ error: 'name must be a non-empty string' }), {
        status: 400,
        headers,
      });
    }
    store.prompts[idx].name = name.trim();
  }

  if (text !== undefined) {
    if (typeof text !== 'string' || !text.trim()) {
      return new Response(JSON.stringify({ error: 'text must be a non-empty string' }), {
        status: 400,
        headers,
      });
    }
    store.prompts[idx].text = text.trim();
  }

  if (isDefault !== undefined) {
    store.prompts[idx].isDefault = !!isDefault;
    if (isDefault) {
      store.prompts.forEach((p, i) => {
        if (i !== idx) p.isDefault = false;
      });
      store.defaultPromptId = promptId;
    } else if (store.defaultPromptId === promptId) {
      store.defaultPromptId = null;
    }
  }

  await writePrompts(env, store);

  return new Response(JSON.stringify({ prompt: store.prompts[idx] }), {
    headers,
  });
}

/**
 * DELETE /api/prompts/:id
 *
 * Removes a prompt by ID.
 */
export async function handleDeletePrompt(request, env, promptId) {
  const origin = request.headers.get('Origin') || '';
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(origin) };

  const store = await readPrompts(env);
  const idx = store.prompts.findIndex((p) => p.id === promptId);

  if (idx === -1) {
    return new Response(JSON.stringify({ error: 'Prompt not found' }), {
      status: 404,
      headers,
    });
  }

  const removed = store.prompts.splice(idx, 1)[0];

  if (store.defaultPromptId === promptId) {
    store.defaultPromptId = null;
  }

  await writePrompts(env, store);

  return new Response(JSON.stringify({ deleted: removed.id }), {
    headers,
  });
}
