/**
 * Google Tasks Integration — PLACEHOLDER
 *
 * Google Tasks syncs automatically with Google Calendar when tasks have due dates.
 * This gives you a calendar view of logged workouts, supplement reminders, etc.
 *
 * ── SETUP STEPS ───────────────────────────────────────────────────────────────
 * 1. Go to https://console.cloud.google.com/ and create or select a project.
 * 2. Navigate to "APIs & Services" → "Library" and enable "Google Tasks API".
 * 3. Go to "APIs & Services" → "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs".
 *    - Application type: Web application
 *    - Authorized JS origins: http://localhost:5173
 *    - Authorized redirect URIs: http://localhost:5173
 * 4. Copy the Client ID into .env as VITE_GOOGLE_CLIENT_ID.
 * 5. Replace the TODO blocks below with the gapi + google-identity-services calls.
 *
 * Reference: https://developers.google.com/tasks/quickstart/js
 * ──────────────────────────────────────────────────────────────────────────────
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCOPES = 'https://www.googleapis.com/auth/tasks';

let _tokenClient = null;
let _accessToken = null;

// ── Auth ──────────────────────────────────────────────────────────────────────

export function isConfigured() {
  return Boolean(CLIENT_ID);
}

export async function signIn() {
  if (!isConfigured()) {
    throw new Error('VITE_GOOGLE_CLIENT_ID is not set. See src/services/googleTasks.js for setup.');
  }

  // TODO: Load the Google Identity Services script dynamically, then:
  //   _tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPES, callback: ... });
  //   _tokenClient.requestAccessToken();
  console.warn('[Google Tasks] TODO: implement OAuth sign-in flow');
  throw new Error('Google Tasks sign-in not yet implemented. See src/services/googleTasks.js.');
}

export function isSignedIn() {
  return Boolean(_accessToken);
}

// ── Task list ─────────────────────────────────────────────────────────────────

export async function getOrCreateWellnessList() {
  // TODO: GET https://tasks.googleapis.com/tasks/v1/users/@me/lists
  //       Find a list named "Wetzel Wellness" or create it.
  console.warn('[Google Tasks] TODO: getOrCreateWellnessList');
  return null;
}

// ── Create tasks ──────────────────────────────────────────────────────────────

/**
 * Push a daily wellness summary as a Google Task (appears on Google Calendar).
 * @param {string} date         ISO date string "YYYY-MM-DD"
 * @param {object} log          Daily log object
 * @param {object} settings     App settings
 */
export async function pushDailySummary(date, log, settings) {
  if (!isSignedIn()) throw new Error('Not signed in to Google Tasks.');

  const listId = await getOrCreateWellnessList();
  const title = buildTaskTitle(date, log, settings);
  const notes = buildTaskNotes(log, settings);

  // TODO: POST https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks
  // Body: { title, notes, due: `${date}T00:00:00.000Z` }
  console.log('[Google Tasks] Would create task:', { title, notes, due: date });
}

/**
 * Create a supplement reminder task for a future date.
 */
export async function createSupplementReminder(supplement, date) {
  if (!isSignedIn()) throw new Error('Not signed in to Google Tasks.');

  const listId = await getOrCreateWellnessList();
  // TODO: POST to Google Tasks API
  console.log('[Google Tasks] Would create supplement reminder:', { supplement, date });
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function buildTaskTitle(date, log, settings) {
  const totalProtein = (log.meals || []).reduce((s, m) => s + (m.macros?.protein || 0), 0);
  const proteinTarget = settings.macroTargets.protein;
  const suppCount = (settings.supplements || []).filter(s => s.active && log.supplements?.[s.id]).length;
  const totalSupps = (settings.supplements || []).filter(s => s.active).length;
  const exercises = (log.exercises || []).length;

  return `Wellness Log ${date} · P:${totalProtein}/${proteinTarget}g · Supps:${suppCount}/${totalSupps} · Workouts:${exercises}`;
}

function buildTaskNotes(log, settings) {
  const lines = [];

  if (log.meals?.length) {
    lines.push('── Meals ──');
    for (const m of log.meals) {
      const p = m.macros?.protein || 0;
      const f = m.macros?.fat || 0;
      const c = m.macros?.carbs || 0;
      lines.push(`[${m.timeBlock}] ${m.description} — P:${p}g F:${f}g C:${c}g`);
    }
  }

  if (log.exercises?.length) {
    lines.push('── Exercise ──');
    for (const e of log.exercises) {
      lines.push(`${e.category.toUpperCase()} · ${e.type} · ${e.duration} min`);
    }
  }

  lines.push(`Water: ${log.water || 0}/${settings.waterTarget} glasses`);
  lines.push(`Electrolytes: ${log.electrolytes ? 'Yes' : 'No'}`);

  return lines.join('\n');
}
