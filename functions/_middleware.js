/**
 * Cloudflare Pages middleware — password-gates the entire site.
 *
 * Setup:
 *   1. Deploy this file (it ships with the next git push).
 *   2. In Cloudflare: Workers & Pages → wetzelwellness → Settings →
 *      Environment Variables → Add variable:
 *        APP_PASSWORD = <your chosen password>
 *      Add it to both Production and Preview environments, then redeploy.
 *
 * How it works:
 *   - Every request is intercepted here before Pages serves anything.
 *   - A valid session cookie (HMAC of the password) passes the gate.
 *   - Without it, the user sees a styled login form at the same URL.
 *   - POST /__login validates the password and sets the cookie (30 days).
 *   - If APP_PASSWORD is not set, the middleware is a no-op (site is open).
 */

const COOKIE_NAME = '__ww_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const HMAC_KEY_MATERIAL = 'wetzel-wellness-auth-v1';

export async function onRequest({ request, env, next }) {
  const password = env.APP_PASSWORD;

  // No password configured → site is open (useful during initial deploy/testing)
  if (!password) return next();

  const url = new URL(request.url);

  // ── Handle login form POST ─────────────────────────────────────────────────
  if (request.method === 'POST' && url.pathname === '/__login') {
    let attempt = '';
    try {
      const form = await request.formData();
      attempt = form.get('password') ?? '';
    } catch {
      return loginPage('Bad request', 400);
    }

    if (attempt !== password) {
      return loginPage('Incorrect password — try again.', 401);
    }

    const token = await makeToken(password);
    const redirectTo = url.searchParams.get('next') || '/';

    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectTo,
        'Set-Cookie': `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}`,
      },
    });
  }

  // ── Validate session cookie ────────────────────────────────────────────────
  const cookieHeader = request.headers.get('Cookie') || '';
  const sessionToken = parseCookie(cookieHeader, COOKIE_NAME);
  const expectedToken = await makeToken(password);

  if (sessionToken === expectedToken) {
    return next(); // authenticated — let the request through
  }

  // ── Not authenticated → show login page ───────────────────────────────────
  return loginPage('', 200);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Produces a stable HMAC-SHA-256 hex token from the password.
 * Using HMAC (not plain SHA-256) so the token depends on a server-side key,
 * not just the password hash, making offline brute-force harder.
 */
async function makeToken(password) {
  const keyBytes = new TextEncoder().encode(HMAC_KEY_MATERIAL);
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(password),
  );
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function parseCookie(header, name) {
  for (const pair of header.split(';')) {
    const [k, ...rest] = pair.trim().split('=');
    if (k.trim() === name) return rest.join('=').trim();
  }
  return null;
}

function loginPage(errorMessage, status) {
  const error = errorMessage
    ? `<p class="error">${errorMessage}</p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wetzel Wellness · Sign In</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f8fafc;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
      padding: 16px;
    }
    .card {
      background: #fff;
      border-radius: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 8px 32px rgba(0,0,0,.07);
      padding: 44px 40px;
      width: 100%;
      max-width: 380px;
    }
    .logo { text-align: center; font-size: 36px; margin-bottom: 10px; }
    h1 {
      text-align: center;
      font-size: 21px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -.3px;
      margin-bottom: 4px;
    }
    .sub {
      text-align: center;
      font-size: 13px;
      color: #94a3b8;
      margin-bottom: 32px;
    }
    label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      letter-spacing: .06em;
      text-transform: uppercase;
      margin-bottom: 7px;
    }
    input[type="password"] {
      display: block;
      width: 100%;
      padding: 11px 14px;
      border: 1.5px solid #e2e8f0;
      border-radius: 10px;
      font-size: 15px;
      color: #0f172a;
      outline: none;
      transition: border-color .15s, box-shadow .15s;
      background: #fff;
    }
    input[type="password"]:focus {
      border-color: #10b981;
      box-shadow: 0 0 0 3px rgba(16,185,129,.15);
    }
    .error {
      margin-top: 10px;
      font-size: 13px;
      color: #ef4444;
      font-weight: 500;
    }
    button {
      display: block;
      width: 100%;
      margin-top: 22px;
      padding: 12px;
      background: #10b981;
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background .15s, transform .08s;
      letter-spacing: -.1px;
    }
    button:hover  { background: #059669; }
    button:active { transform: scale(.98); }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🌿</div>
    <h1>Wetzel Wellness</h1>
    <p class="sub">Personal wellness tracker</p>
    <form method="POST" action="/__login">
      <label for="pw">Password</label>
      <input
        id="pw"
        type="password"
        name="password"
        placeholder="Enter password"
        autofocus
        autocomplete="current-password"
        required
      >
      ${error}
      <button type="submit">Sign in →</button>
    </form>
  </div>
</body>
</html>`;

  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
