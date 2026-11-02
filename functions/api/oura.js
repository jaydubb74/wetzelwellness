/**
 * Cloudflare Pages Function — proxies requests to the Oura API v2.
 * Runs server-side at /api/oura so the browser never makes a cross-origin
 * request (same pattern as /api/llm).
 *
 * GET /api/oura?endpoint=daily_sleep&start_date=2026-07-17&end_date=2026-07-17
 * Header: x-oura-token — the user's Personal Access Token.
 */

const ALLOWED_ENDPOINTS = new Set(['daily_sleep', 'sleep', 'daily_readiness', 'daily_activity']);

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);

  const token = request.headers.get('x-oura-token');
  if (!token) {
    return json({ error: 'No Oura token provided' }, 401);
  }

  const endpoint = url.searchParams.get('endpoint');
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return json({ error: `endpoint must be one of: ${[...ALLOWED_ENDPOINTS].join(', ')}` }, 400);
  }

  const upstream = new URL(`https://api.ouraring.com/v2/usercollection/${endpoint}`);
  for (const param of ['start_date', 'end_date']) {
    const v = url.searchParams.get(param);
    if (v) upstream.searchParams.set(param, v);
  }

  const res = await fetch(upstream, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.text();

  return new Response(data, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
