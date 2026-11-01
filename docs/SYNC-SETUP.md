# One-time Cloudflare setup for cross-device sync

Cross-device sync stores daily logs + settings in Workers KV behind
`functions/api/sync/[[path]].js`. It needs a KV binding and a secret on the
`wetzelwellness` Pages project. Until these exist, the app works exactly as
before (sync silently no-ops; "Sync now" shows an error).

## Steps (~2 minutes)

1. **Log in** (local machine): `npx wrangler login`

2. **Create the KV namespace:**
   ```sh
   npx wrangler kv namespace create WW_KV
   ```

3. **Bind it to the Pages project** — Cloudflare dashboard →
   Workers & Pages → `wetzelwellness` → Settings → Bindings → Add →
   KV namespace: variable name `WW_KV`, select the namespace from step 2.

4. **Set the sync secret** — same Settings page → Environment variables →
   Add → name `SYNC_KEY`, value: any passphrase you choose (mark as Secret).
   Apply to Production.

5. **Redeploy** (push to `main`, or Retry deployment in the dashboard) so the
   function picks up the bindings.

6. **In the app** (each device): Settings → Oura & Device Sync → enter the
   same passphrase as Device Sync Key → Sync now.

## Oura (OAuth2 — Oura retired Personal Access Tokens)

1. Create an application at <https://cloud.ouraring.com/oauth/applications>.
2. Set the **redirect URI(s)** to where the app runs, with a trailing slash:
   - `https://wetzelwellness.pages.dev/` (and/or your custom domain)
   - `http://localhost:5173/` if you want to connect from local dev
3. In the app: Settings → Oura & Device Sync → paste **Client ID** and
   **Client Secret** → **Connect Oura** → approve on Oura's consent page.
   You land back in the app connected; use **Test** to confirm.

Notes:
- Token exchange goes through the `/api/oura-token` Pages Function, so the
  **deployed site must include it** before Connect works (push to `main`
  first). Local dev proxies to the deployed site too.
- Access tokens auto-refresh. Oura refresh tokens are single-use; if you use
  two devices, tokens ride along with device sync so they stay consistent.
- If Oura ever revokes the session, the app shows "reconnect in Settings" —
  one click re-runs the consent flow.

## How sync behaves

- localStorage remains the source of truth on-device; KV is the shared mirror.
- Pull on app start and whenever the app comes back into view; debounced
  push ~2 s after every edit (and when the app is hidden); per-date
  last-write-wins using `updatedAt` timestamps.
- A device pushes nothing until its first successful pull with the key. If
  its targets/supplements are still the defaults, it adopts the shared
  settings (keeping any API key / Oura credentials it has that the shared
  copy lacks) instead of overwriting them.
- KV is eventually consistent (~60 s across regions) — fine for one person on
  two devices; just avoid editing the same day on both devices at the same
  moment.
