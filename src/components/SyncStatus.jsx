import { useState, useEffect } from 'react';
import * as sync from '../services/sync.js';

/**
 * Small header indicator so sync problems are visible outside Settings.
 * Renders nothing until a sync key is set.
 */
export default function SyncStatus({ onOpenSettings }) {
  const [status, setStatus] = useState(sync.getStatus());
  useEffect(() => sync.onStatusChange(setStatus), []);

  if (!sync.isConfigured()) return null;

  const { state, lastSyncedAt, error } = status;
  const time = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;

  const view =
    state === 'error'   ? { dot: 'bg-red-500',    text: 'Sync error', tone: 'text-red-600' }
    : state === 'syncing' ? { dot: 'bg-amber-400 animate-pulse', text: 'Syncing…', tone: 'text-slate-600' }
    : time              ? { dot: 'bg-brand-500',  text: `Synced ${time}`, tone: 'text-slate-500' }
    :                     { dot: 'bg-slate-300',  text: 'Not synced yet', tone: 'text-slate-500' };

  return (
    <button
      onClick={onOpenSettings}
      title={state === 'error' ? `${error} — open Settings` : 'Device sync — open Settings'}
      className={`flex items-center gap-1.5 text-xs ${view.tone} hover:text-slate-800 rounded-lg px-2 py-1 -mr-2`}
      aria-live="polite"
    >
      <span className={`w-2 h-2 rounded-full ${view.dot}`} aria-hidden="true" />
      {view.text}
    </button>
  );
}
