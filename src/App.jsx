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
      {/* ── Sticky header + tab bar (one container, no magic offsets) ───── */}
      <div
        className="sticky top-0 z-20 bg-white"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <header className="border-b border-slate-100 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">🌿</span>
            <span className="font-semibold text-slate-900 text-base tracking-tight">Wetzel Wellness</span>
          </div>
          <span className="text-xs text-slate-400 hidden sm:block">
            {formatFull(today())}
          </span>
          <div className="w-[120px] hidden sm:block" /> {/* spacer to center date on desktop */}
        </header>
        <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <main
        className="flex-1 max-w-2xl w-full mx-auto px-4 pb-16 pt-5"
        style={{
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
          paddingBottom: 'max(4rem, env(safe-area-inset-bottom))',
        }}
      >
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
