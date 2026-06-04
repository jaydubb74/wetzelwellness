import { useState } from 'react';
import Navigation from './components/Navigation.jsx';
import DailyView from './components/daily/DailyView.jsx';
import ProgressionView from './components/progression/ProgressionView.jsx';
import SettingsView from './components/settings/SettingsView.jsx';
import { useSettings } from './hooks/useSettings.js';
import { today, formatFull } from './utils/dates.js';

export default function App() {
  const [activeTab, setActiveTab] = useState('daily');
  const [jumpDate, setJumpDate] = useState(null);
  const { settings, update: updateSettings, replace: replaceSettings } = useSettings();

  function navigateToDate(date) {
    setJumpDate(date);
    setActiveTab('daily');
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">🌿</span>
          <span className="font-semibold text-slate-900 text-base tracking-tight">Wetzel Wellness</span>
        </div>
        <span className="text-xs text-slate-400 hidden sm:block">
          {formatFull(today())}
        </span>
        <div className="w-[120px]" /> {/* spacer to center title on mobile */}
      </header>

      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 pb-16 pt-5">
        {activeTab === 'daily' && (
          <DailyView settings={settings} jumpDate={jumpDate} onJumpConsumed={() => setJumpDate(null)} />
        )}
        {activeTab === 'progression' && (
          <ProgressionView settings={settings} onNavigateToDate={navigateToDate} />
        )}
        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            onUpdate={updateSettings}
            onReplace={replaceSettings}
          />
        )}
      </main>
    </div>
  );
}
