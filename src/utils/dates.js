export function today() {
  return new Date().toISOString().split('T')[0];
}

export function formatDisplay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const isToday = dateStr === today();
  const isYesterday = dateStr === offsetDate(today(), -1);
  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';
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

export function offsetDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function getWeekDates(anchorDate = today()) {
  const d = new Date(anchorDate + 'T00:00:00');
  const day = d.getDay(); // 0=Sun
  const start = new Date(d);
  start.setDate(d.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => {
    const nd = new Date(start);
    nd.setDate(start.getDate() + i);
    return nd.toISOString().split('T')[0];
  });
}

export function getPastDays(n, anchor = today()) {
  return Array.from({ length: n }, (_, i) => offsetDate(anchor, -(n - 1 - i)));
}

export function getMonthDates(anchorDate = today()) {
  const d = new Date(anchorDate + 'T00:00:00');
  const year = d.getFullYear();
  const month = d.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) =>
    new Date(year, month, i + 1).toISOString().split('T')[0]
  );
}

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
