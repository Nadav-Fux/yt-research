/**
 * Validate the Bearer token on an incoming request against
 * the INGEST_TOKEN secret stored in the Worker environment.
 *
 * @param {Request} request
 * @param {object}  env
 * @returns {boolean}
 */
export function validateToken(request, env) {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return false;
  }

  const token = match[1].trim();

  if (!env.INGEST_TOKEN) {
    // If the secret hasn't been configured yet, reject everything.
    return false;
  }

  return token === env.INGEST_TOKEN;
}
