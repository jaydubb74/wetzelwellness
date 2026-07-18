/**
 * Oura API v2 client. All requests go through the same-origin /api/oura proxy
 * (Pages Function in prod, Vite proxy → deployed site in dev).
 *
 * The fetched summary is stored on the daily log as `log.oura`, so it rides
 * along with cross-device sync and acts as the cache: past days never
 * re-fetch, today re-fetches when stale.
 */
import * as storage from './storage.js';
import { offsetDate } from '../utils/dates.js';

export const TODAY_REFRESH_MS = 30 * 60 * 1000;

// ── OAuth2 (Oura deprecated Personal Access Tokens in favor of app
//    client id/secret + authorization-code flow) ─────────────────────────────

const AUTHORIZE_URL = 'https://cloud.ouraring.com/oauth/authorize';
const OAUTH_SCOPES = 'personal daily workout';
const STATE_KEY = 'ww_oura_oauth_state';
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

function redirectUri() {
  return window.location.origin + '/';
}

/** True when credentials exist (client id/secret, or a legacy PAT). */
export function isConfigured() {
  const s = storage.getSettings();
  return Boolean((s.ouraClientId && s.ouraClientSecret) || s.ouraToken);
}

/** True when we can actually make API calls (authorized, or legacy PAT). */
export function isConnected() {
  const s = storage.getSettings();
  return Boolean(s.ouraAuth?.refreshToken || s.ouraToken);
}

/** Sends the browser to Oura's consent page. */
export function beginOuraAuth() {
  const s = storage.getSettings();
  if (!s.ouraClientId) throw new Error('Enter your Oura Client ID first');
  const state = crypto.randomUUID();
  sessionStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: s.ouraClientId,
    redirect_uri: redirectUri(),
    scope: OAUTH_SCOPES,
    state,
  });
  window.location.assign(`${AUTHORIZE_URL}?${params}`);
}

/**
 * Completes the OAuth flow if the current URL carries ?code from Oura.
 * Call once on app boot, before rendering. Returns true if tokens were stored.
 */
export async function handleOuraCallback() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  if (!code) return false;

  const expectedState = sessionStorage.getItem(STATE_KEY);
  const state = url.searchParams.get('state');
  // Always clean the OAuth params off the URL, even on failure.
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  url.searchParams.delete('scope');
  window.history.replaceState({}, '', url.pathname + url.search);
  sessionStorage.removeItem(STATE_KEY);

  if (!expectedState || state !== expectedState) {
    throw new Error('Oura authorization failed (state mismatch) — try connecting again');
  }
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
  saveTokens(tokens);
  return true;
}

export function disconnectOura() {
  storage.saveSettings({ ...storage.getSettings(), ouraAuth: null });
}

function saveTokens(tokens) {
  storage.saveSettings({
    ...storage.getSettings(),
    ouraAuth: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in || 86400) * 1000,
    },
  });
}

async function tokenRequest(fields) {
  const s = storage.getSettings();
  const res = await fetch('/api/oura-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...fields, client_id: s.ouraClientId, client_secret: s.ouraClientSecret }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Oura token request failed (${res.status})`);
  }
  return data;
}

let refreshPromise = null;

/** Returns a valid access token, refreshing if needed (single-flight). */
async function getAccessToken() {
  const s = storage.getSettings();
  if (s.ouraToken) return s.ouraToken; // legacy PAT
  const auth = s.ouraAuth;
  if (!auth?.refreshToken) throw new Error('Oura not connected — use Connect Oura in Settings');
  if (auth.accessToken && Date.now() < auth.expiresAt - EXPIRY_MARGIN_MS) {
    return auth.accessToken;
  }
  // Oura refresh tokens are single-use: never fire two refreshes at once.
  refreshPromise ??= tokenRequest({ grant_type: 'refresh_token', refresh_token: auth.refreshToken })
    .then(tokens => {
      saveTokens(tokens);
      return tokens.access_token;
    })
    .catch(e => {
      if (/invalid|expired|revoked/i.test(e.message)) disconnectOura();
      throw new Error('Oura session expired — reconnect in Settings');
    })
    .finally(() => { refreshPromise = null; });
  return refreshPromise;
}

async function ouraGet(endpoint, startDate, endDate = startDate) {
  const token = await getAccessToken();
  const params = new URLSearchParams({ endpoint, start_date: startDate, end_date: endDate });
  const res = await fetch(`/api/oura?${params}`, { headers: { 'x-oura-token': token } });
  if (res.status === 401) throw new Error('Oura rejected the token — reconnect in Settings');
  if (!res.ok) throw new Error(`Oura request failed (${res.status})`);
  return (await res.json()).data || [];
}

export async function testOuraConnection() {
  const today = new Date().toISOString().slice(0, 10);
  await ouraGet('daily_activity', today);
  return true;
}

/**
 * Fetches sleep, activity, and workouts for one date and returns the
 * summary object stored as `log.oura`.
 */
export async function fetchOuraDay(date) {
  const [dailySleep, sleepSessions, dailyActivity, workouts] = await Promise.all([
    ouraGet('daily_sleep', date),
    // Oura's `sleep` endpoint dates a period by its bedtime_start's calendar
    // day, one day before the wake-day `daily_sleep` score it belongs to —
    // so a same-day query alone can miss last night's session entirely.
    ouraGet('sleep', offsetDate(date, -1), date),
    ouraGet('daily_activity', date),
    ouraGet('workout', date),
  ]);

  // Longest long_sleep session in the window is the one the daily score covers.
  const mainSleep = sleepSessions
    .filter(s => s.type === 'long_sleep')
    .sort((a, b) => (b.total_sleep_duration || 0) - (a.total_sleep_duration || 0))[0];

  const sleep = (dailySleep[0] || mainSleep)
    ? {
        score: dailySleep[0]?.score ?? null,
        totalSeconds: mainSleep?.total_sleep_duration ?? null,
        deepSeconds: mainSleep?.deep_sleep_duration ?? null,
        remSeconds: mainSleep?.rem_sleep_duration ?? null,
        lightSeconds: mainSleep?.light_sleep_duration ?? null,
        restingHeartRate: mainSleep?.lowest_heart_rate ?? null,
        averageHrv: mainSleep?.average_hrv ?? null,
      }
    : null;

  const act = dailyActivity[0];
  const activity = act
    ? {
        score: act.score ?? null,
        steps: act.steps ?? null,
        activeCalories: act.active_calories ?? null,
        totalCalories: act.total_calories ?? null,
      }
    : null;

  return {
    sleep,
    activity,
    workouts: workouts.map(w => ({
      id: w.id,
      activity: w.activity,
      category: mapWorkoutCategory(w.activity, w.intensity),
      intensity: w.intensity ?? null,
      calories: w.calories != null ? Math.round(w.calories) : null,
      minutes: workoutMinutes(w),
      start: w.start_datetime ?? null,
    })),
    fetchedAt: Date.now(),
  };
}

function workoutMinutes(w) {
  if (!w.start_datetime || !w.end_datetime) return null;
  const ms = new Date(w.end_datetime) - new Date(w.start_datetime);
  return ms > 0 ? Math.round(ms / 60000) : null;
}

/**
 * Maps an Oura workout activity + intensity to the app's exercise categories
 * (zone2 / hiit / strength / movement / other).
 */
export function mapWorkoutCategory(activity, intensity) {
  const a = (activity || '').toLowerCase();
  if (/(strength|weight|functional|cross_?training|crossfit)/.test(a)) return 'strength';
  if (/(interval|hiit)/.test(a)) return 'hiit';
  if (/(walk|hik|yoga|stretch|pilates|house|golf)/.test(a)) return 'movement';
  if (/(run|jog|cycl|bik|row|swim|elliptical|stair|cardio|ski|skat)/.test(a)) {
    return intensity === 'hard' ? 'hiit' : 'zone2';
  }
  return 'other';
}

/** Pretty label: "strength_training" → "Strength Training" */
export function workoutLabel(activity) {
  return (activity || 'Workout')
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
