import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import * as sync from './services/sync.js';
import * as storage from './services/storage.js';
import { handleOuraCallback } from './services/oura.js';
import { today } from './utils/dates.js';
import { snapshotTargets } from './utils/scoring.js';
import './index.css';

// Pull remote data before first render so hooks initialize from merged state.
// Fast (single KV round-trip) and a no-op when no sync key is configured.
async function boot() {
  try {
    // Finish the Oura OAuth redirect first so the new tokens win the settings
    // merge (they're stamped with a fresh updatedAt).
    await handleOuraCallback();
  } catch (e) {
    console.error('Oura authorization failed:', e);
  }
  try {
    await sync.pullAll();
  } catch {
    // Offline or sync unconfigured — render with local data.
  }
  // Past days logged before per-day goals existed keep today's goals from now
  // on, so later goal changes don't rescore them. (After the pull, so they
  // get the shared settings.)
  storage.stampMissingTargets(snapshotTargets(storage.getSettings()), today());

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  sync.startAutoSync();
}

boot();
