/**
 * Cloudflare Pages Function — proxies requests to Anthropic's API.
 * Runs server-side at /api/llm so the browser never makes a cross-origin
 * request, eliminating all CORS issues.
 */
export async function onRequestPost(context) {
  const { request } = context;

  const apiKey = request.headers.get('x-api-key');
  const anthropicVersion =
    request.headers.get('anthropic-version') || '2023-06-01';

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: { message: 'No API key provided' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const body = await request.text();

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': anthropicVersion,
    },
    body,
  });

  const data = await upstream.text();

  return new Response(data, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
