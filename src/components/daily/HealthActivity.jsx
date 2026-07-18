import * as ouraService from '../../services/oura.js';

function hm(seconds) {
  if (seconds == null) return '–';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function ScoreBadge({ score }) {
  if (score == null) return null;
  const tone =
    score >= 85 ? 'bg-brand-50 text-brand-700 border-brand-200'
    : score >= 70 ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-rose-50 text-rose-600 border-rose-200';
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${tone}`}>
      {score}
    </span>
  );
}

function Stat({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold text-slate-800 tabular-nums truncate">{value}</p>
    </div>
  );
}

/**
 * Oura summary cards for one day: sleep + activity.
 * Renders nothing when there's no data and no token configured.
 */
export default function HealthActivity({ oura, syncing, error, onRefresh }) {
  const configured = ouraService.isConnected();

  if (!configured && !oura) {
    return (
      <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2.5">
        💍 Connect your Oura ring in <span className="font-medium">Settings</span> to
        auto-fill sleep, activity, and workouts.
      </p>
    );
  }

  const sleep = oura?.sleep;
  const activity = oura?.activity;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Sleep */}
        <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-indigo-900">😴 Sleep</p>
            <ScoreBadge score={sleep?.score} />
          </div>
          {sleep ? (
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Total" value={hm(sleep.totalSeconds)} />
              <Stat label="Deep" value={hm(sleep.deepSeconds)} />
              <Stat label="REM" value={hm(sleep.remSeconds)} />
              <Stat label="Resting HR" value={sleep.restingHeartRate != null ? `${sleep.restingHeartRate} bpm` : '–'} />
              <Stat label="HRV" value={sleep.averageHrv != null ? `${Math.round(sleep.averageHrv)} ms` : '–'} />
            </div>
          ) : oura?.errors?.sleep ? (
            <p className="text-xs text-red-500">{oura.errors.sleep}</p>
          ) : (
            <p className="text-xs text-slate-400">No sleep data yet</p>
          )}
        </div>

        {/* Activity */}
        <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-amber-900">🔥 Activity</p>
            <ScoreBadge score={activity?.score} />
          </div>
          {activity ? (
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Steps" value={activity.steps?.toLocaleString() ?? '–'} />
              <Stat label="Active Cal" value={activity.activeCalories?.toLocaleString() ?? '–'} />
              <Stat label="Total Cal" value={activity.totalCalories?.toLocaleString() ?? '–'} />
            </div>
          ) : oura?.errors?.activity ? (
            <p className="text-xs text-red-500">{oura.errors.activity}</p>
          ) : (
            <p className="text-xs text-slate-400">No activity data yet</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onRefresh(true)}
          disabled={syncing || !configured}
          className="btn-ghost text-xs"
        >
          {syncing ? (
            <span className="inline-block w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          ) : '💍'}
          {syncing ? 'Syncing…' : 'Sync Oura'}
        </button>
        {oura?.fetchedAt && !syncing && (
          <span className="text-[11px] text-slate-400">
            updated {new Date(oura.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    </div>
  );
}
