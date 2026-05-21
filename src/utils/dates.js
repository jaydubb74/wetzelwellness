// ── Canonical local-date helpers ───────────────────────────────────────────────
//
// IMPORTANT: Never use toISOString().split('T')[0] to derive the user's current
// calendar day. toISOString() returns UTC, which diverges from the user's local
// date by the timezone offset and produces wrong results for all UTC± users.
// Always use getLocalDateKey() / today() for day-keyed storage and comparisons.

/**
 * Returns the YYYY-MM-DD string for `date` in the user's LOCAL timezone.
 * Defaults to the current moment when called without arguments.
 *
 * @param {Date} [date]
 * @returns {string} e.g. "2026-05-21"
 */
export function getLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Today's local date key. Use this everywhere you need "today" as a string.
 * @returns {string}
 */
export function today() {
  return getLocalDateKey();
}

/**
 * Returns true when `dateKey` equals today's local date.
 * @param {string} dateKey
 * @returns {boolean}
 */
export function isToday(dateKey) {
  return dateKey === getLocalDateKey();
}

// ── Display formatting ─────────────────────────────────────────────────────────

export function formatDisplay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isToday(dateStr)) return 'Today';
  if (dateStr === offsetDate(today(), -1)) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

export function formatShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatFull(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

// ── Date arithmetic ────────────────────────────────────────────────────────────

/**
 * Returns the date key `days` before/after `dateStr`, in local time.
 * Uses getLocalDateKey() on the result — never toISOString() — so it is safe
 * for all timezones including UTC+ where toISOString() can return the prior day.
 *
 * @param {string} dateStr  YYYY-MM-DD
 * @param {number} days     positive = future, negative = past
 * @returns {string}
 */
export function offsetDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return getLocalDateKey(d); // ← was toISOString().split('T')[0] — bug fixed
}

/**
 * Returns the 7 YYYY-MM-DD keys for the Sun-Sat week containing `anchorDate`.
 * @param {string} [anchorDate]
 * @returns {string[]}
 */
export function getWeekDates(anchorDate = today()) {
  const d = new Date(anchorDate + 'T00:00:00');
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay()); // rewind to Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const nd = new Date(start);
    nd.setDate(start.getDate() + i);
    return getLocalDateKey(nd); // ← was toISOString().split('T')[0] — bug fixed
  });
}

/**
 * Returns the last `n` date keys ending at (and including) `anchor`.
 * @param {number} n
 * @param {string} [anchor]
 * @returns {string[]}
 */
export function getPastDays(n, anchor = today()) {
  return Array.from({ length: n }, (_, i) => offsetDate(anchor, -(n - 1 - i)));
}

/**
 * Returns all YYYY-MM-DD keys for the calendar month containing `anchorDate`.
 * @param {string} [anchorDate]
 * @returns {string[]}
 */
export function getMonthDates(anchorDate = today()) {
  const d = new Date(anchorDate + 'T00:00:00');
  const year = d.getFullYear();
  const month = d.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) =>
    getLocalDateKey(new Date(year, month, i + 1)) // ← was toISOString().split('T')[0] — bug fixed
  );
}

// ── Label helpers ──────────────────────────────────────────────────────────────

export function weekLabel(anchorDate = today()) {
  const dates = getWeekDates(anchorDate);
  return `${formatShort(dates[0])} – ${formatShort(dates[6])}`;
}

export function monthLabel(anchorDate = today()) {
  const d = new Date(anchorDate + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function dayOfWeekInitial(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()];
}
