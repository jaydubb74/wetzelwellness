/**
 * Cloudflare Pages Function — cross-device sync backed by Workers KV.
 *
 * Binding required on the Pages project:
 *   WW_KV    — KV namespace
 *   SYNC_KEY — secret; clients must send it as the `x-sync-key` header
 *
 * Routes (all under /api/sync):
 *   GET  /api/sync               → { logs: { "YYYY-MM-DD": { log, updatedAt } }, settings }
 *   PUT  /api/sync/log/:date     → body { log, updatedAt }
 *   PUT  /api/sync/settings      → body { settings, updatedAt }
 *
 * Conflict handling: writes are skipped if KV already holds a newer updatedAt
 * (last-write-wins per date).
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequest(context) {
  const { request, env, params } = context;

  if (!env.WW_KV || !env.SYNC_KEY) {
    return json({ error: 'Sync not configured on server (WW_KV / SYNC_KEY missing)' }, 501);
  }
  if (request.headers.get('x-sync-key') !== env.SYNC_KEY) {
    return json({ error: 'Invalid sync key' }, 401);
  }

  const path = params.path || []; // e.g. [], ['log', '2026-07-17'], ['settings']

  if (request.method === 'GET' && path.length === 0) {
    const logs = {};
    let cursor;
    do {
      const page = await env.WW_KV.list({ prefix: 'log:', cursor });
      const entries = await Promise.all(
        page.keys.map(async k => [k.name.slice(4), await env.WW_KV.get(k.name, 'json')])
      );
      for (const [date, value] of entries) {
        if (value) logs[date] = value;
      }
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);

    const settings = await env.WW_KV.get('settings', 'json');
    return json({ logs, settings });
  }

  if (request.method === 'PUT' && path[0] === 'log' && /^\d{4}-\d{2}-\d{2}$/.test(path[1] || '')) {
    const date = path[1];
    const body = await request.json().catch(() => null);
    if (!body || typeof body.log !== 'object' || typeof body.updatedAt !== 'number') {
      return json({ error: 'Expected { log, updatedAt }' }, 400);
    }
    const existing = await env.WW_KV.get(`log:${date}`, 'json');
    if (existing && existing.updatedAt >= body.updatedAt) {
      return json({ ok: true, skipped: 'remote-newer', remote: existing });
    }
    await env.WW_KV.put(`log:${date}`, JSON.stringify({ log: body.log, updatedAt: body.updatedAt }));
    return json({ ok: true });
  }

  if (request.method === 'PUT' && path[0] === 'settings') {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.settings !== 'object' || typeof body.updatedAt !== 'number') {
      return json({ error: 'Expected { settings, updatedAt }' }, 400);
    }
    const existing = await env.WW_KV.get('settings', 'json');
    if (existing && existing.updatedAt >= body.updatedAt) {
      return json({ ok: true, skipped: 'remote-newer', remote: existing });
    }
    await env.WW_KV.put('settings', JSON.stringify({ settings: body.settings, updatedAt: body.updatedAt }));
    return json({ ok: true });
  }

  return json({ error: 'Not found' }, 404);
}
