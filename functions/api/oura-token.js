/**
 * Cloudflare Pages Function — proxies OAuth2 token requests to Oura.
 * The browser can't call api.ouraring.com/oauth/token directly (CORS), so the
 * client posts JSON here and we forward it as form-urlencoded.
 *
 * POST /api/oura-token
 * body: { grant_type: 'authorization_code'|'refresh_token', code?, refresh_token?,
 *         redirect_uri?, client_id, client_secret }
 */
export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => null);
  if (!body?.client_id || !body?.client_secret || !body?.grant_type) {
    return json({ error: 'Expected client_id, client_secret, grant_type' }, 400);
  }

  const form = new URLSearchParams();
  for (const key of ['grant_type', 'code', 'refresh_token', 'redirect_uri', 'client_id', 'client_secret']) {
    if (body[key]) form.set(key, body[key]);
  }

  const upstream = await fetch('https://api.ouraring.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const data = await upstream.text();

  return new Response(data, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
