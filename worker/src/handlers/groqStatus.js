import { corsHeaders } from '../lib/cors.js';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const APIFY_USER_URL = 'https://api.apify.com/v2/users/me';
const APIFY_LIMITS_URL = 'https://api.apify.com/v2/users/me/limits';
const APIFY_RUNS_URL = 'https://api.apify.com/v2/actor-runs';

/**
 * GET /api/groq-status
 *
 * Returns rate limits for Groq keys + Apify account balances.
 */
export async function handleGroqStatus(request, env) {
  const origin = request.headers.get('Origin') || '';
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(origin) };

  // --- Groq keys ---
  const groqKeys = [];
  if (env.GROQ_KEYS) {
    env.GROQ_KEYS.split(',').map(k => k.trim()).filter(Boolean).forEach(k => groqKeys.push(k));
  } else if (env.GROQ_API_KEY) {
    groqKeys.push(env.GROQ_API_KEY);
  }

  const groqResults = [];
  for (let i = 0; i < groqKeys.length; i++) {
    const key = groqKeys[i];
    const label = 'Key ' + (i + 1) + ' (' + key.slice(0, 8) + '...)';
    try {
      const resp = await fetch(GROQ_CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
      });
      groqResults.push({
        label,
        status: resp.ok ? 'active' : (resp.status === 429 ? 'rate_limited' : 'error'),
        httpStatus: resp.status,
        requestsLimit: resp.headers.get('x-ratelimit-limit-requests'),
        requestsRemaining: resp.headers.get('x-ratelimit-remaining-requests'),
        requestsReset: resp.headers.get('x-ratelimit-reset-requests'),
        tokensLimit: resp.headers.get('x-ratelimit-limit-tokens'),
        tokensRemaining: resp.headers.get('x-ratelimit-remaining-tokens'),
        tokensReset: resp.headers.get('x-ratelimit-reset-tokens'),
      });
    } catch (err) {
      groqResults.push({ label, status: 'error', error: err.message });
    }
  }

  // --- Apify keys ---
  const apifyKeys = env.APIFY_KEYS
    ? env.APIFY_KEYS.split(',').map(k => k.trim()).filter(Boolean)
    : [];

  const apifyResults = [];
  for (let i = 0; i < apifyKeys.length; i++) {
    const key = apifyKeys[i];
    try {
      // Fetch user info and limits in parallel
      const [userResp, limitsResp] = await Promise.all([
        fetch(APIFY_USER_URL + '?token=' + key),
        fetch(APIFY_LIMITS_URL + '?token=' + key),
      ]);

      if (!userResp.ok) {
        apifyResults.push({ label: 'Account ' + (i + 1), status: 'error', httpStatus: userResp.status });
        continue;
      }

      const userData = await userResp.json();
      const u = userData.data || userData;
      const plan = u.plan || {};

      // Real usage from /limits endpoint
      let usedUsd = 0, limitUsd = plan.maxMonthlyUsageUsd || 5, cycleStart = null, cycleEnd = null;
      if (limitsResp.ok) {
        const limitsData = await limitsResp.json();
        const ld = limitsData.data || limitsData;
        usedUsd = (ld.current || {}).monthlyUsageUsd || 0;
        limitUsd = (ld.limits || {}).maxMonthlyUsageUsd || limitUsd;
        const cycle = ld.monthlyUsageCycle || {};
        cycleStart = cycle.startAt || null;
        cycleEnd = cycle.endAt || null;
      }

      // Check if account is actually disabled (over limit)
      const features = u.effectivePlatformFeatures || {};
      const actorsFeature = features.ACTORS || {};
      const isDisabled = actorsFeature.isEnabled === false;
      const disabledReason = actorsFeature.disabledReasonType || null;

      // Get last run cost
      let lastRunCost = null;
      try {
        const runsResp = await fetch(APIFY_RUNS_URL + '?token=' + key + '&limit=1&status=SUCCEEDED');
        if (runsResp.ok) {
          const runsData = await runsResp.json();
          const items = (runsData.data || {}).items || [];
          if (items.length > 0) lastRunCost = items[0].usageTotalUsd || 0;
        }
      } catch { /* skip */ }

      apifyResults.push({
        label: 'Account ' + (i + 1) + ' (' + (u.username || '?') + ')',
        status: isDisabled ? 'exhausted' : 'active',
        disabledReason,
        plan: plan.id || 'FREE',
        usedUsd: Math.round(usedUsd * 1000) / 1000,
        limitUsd,
        remainingUsd: Math.round(Math.max(0, limitUsd - usedUsd) * 1000) / 1000,
        cycleStart,
        cycleEnd,
        lastRunCost,
      });
    } catch (err) {
      apifyResults.push({ label: 'Account ' + (i + 1), status: 'error', error: err.message });
    }
  }

  return new Response(JSON.stringify({
    groq: { keys: groqResults, totalKeys: groqKeys.length },
    apify: { accounts: apifyResults, totalAccounts: apifyKeys.length },
    timestamp: new Date().toISOString(),
  }), { headers });
}
