import * as ouraService from '../../services/oura.js';
import { ExerciseList } from './ExerciseLogger.jsx';

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
      <p className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold text-slate-800 tabular-nums truncate">{value}</p>
    </div>
  );
}

function tempDeviation(c) {
  if (c == null) return '–';
  return `${c > 0 ? '+' : c < 0 ? '−' : ''}${Math.abs(c).toFixed(1)} °C`;
}

function MovementCard({ exercises, onRemove }) {
  const goalEntries = exercises.filter(ex => ex.category === 'movement');
  const activities = exercises.filter(ex => ex.category !== 'movement');
  const goalCal = goalEntries.reduce((sum, ex) => sum + (ex.activeCalories || 0), 0);

  return (
    <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3 space-y-3">
      <p className="text-xs font-semibold text-amber-900">🔥 Movement</p>

      {/* Movement goal achievement */}
      {goalEntries.length > 0 ? (
        <div className="flex items-center justify-between gap-2 bg-brand-50 border border-brand-200 rounded-lg px-2.5 py-1.5">
          <span className="text-xs font-semibold text-brand-700">✓ Movement goal hit</span>
          <span className="text-xs text-brand-700 tabular-nums">{goalCal.toLocaleString()} active cal</span>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Movement goal not hit yet</p>
      )}

      {/* Logged workouts / activities */}
      {activities.length > 0 ? (
        <ExerciseList exercises={activities} onRemove={onRemove} />
      ) : (
        <p className="text-xs text-slate-500">No activities logged yet</p>
      )}
    </div>
  );
}

/**
 * Daily health cards for one day: Oura sleep + readiness, and movement
 * (goal and logged activities, entered by hand).
 */
export default function HealthActivity({ oura, syncing, error, onRefresh, exercises = [], onRemoveExercise }) {
  const configured = ouraService.isConnected();

  if (!configured && !oura) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5">
          💍 Connect your Oura ring in <span className="font-medium">Settings</span> to
          auto-fill sleep and readiness.
        </p>
        <MovementCard exercises={exercises} onRemove={onRemoveExercise} />
      </div>
    );
  }

  const sleep = oura?.sleep;
  const readiness = oura?.readiness;

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
            <p className="text-xs text-slate-500">No sleep data yet</p>
          )}
        </div>

        {/* Readiness */}
        <div className="bg-teal-50/60 border border-teal-100 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-teal-900">🔋 Readiness</p>
            <ScoreBadge score={readiness?.score} />
          </div>
          {readiness ? (
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Score" value={readiness.score ?? '–'} />
              <Stat label="Body temp" value={tempDeviation(readiness.temperatureDeviation)} />
            </div>
          ) : oura?.errors?.readiness ? (
            <p className="text-xs text-red-500">{oura.errors.readiness}</p>
          ) : (
            <p className="text-xs text-slate-500">No readiness data yet</p>
          )}
        </div>
      </div>

      <MovementCard exercises={exercises} onRemove={onRemoveExercise} />

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
          <span className="text-[11px] text-slate-500">
            updated {new Date(oura.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    </div>
  );
}
