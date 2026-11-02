import { useState, useEffect, useRef } from 'react';
import NumberField from '../NumberField.jsx';
import { HEALTH_SCORE_CONFIG, PLAN_OPTIONS, editPlan, upcomingPlanDays } from '../../utils/healthScore.js';
import { offsetDate, today, formatShort } from '../../utils/dates.js';
import { applySettingsIntent } from '../../services/llm.js';
import * as sync from '../../services/sync.js';
import * as oura from '../../services/oura.js';

const TIMING_OPTIONS = [
  { value: 'morning-empty',     label: 'Morning · Empty Stomach' },
  { value: 'with-food-morning', label: 'Morning · With Food' },
  { value: 'afternoon',         label: 'Afternoon' },
  { value: 'nighttime',         label: 'Nighttime / Bedtime' },
];

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="card space-y-4">
      <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-3">{title}</h3>
      {children}
    </div>
  );
}

// ── Macro Targets ─────────────────────────────────────────────────────────────

function MacroTargets({ targets, onChange }) {
  const fields = [
    { key: 'protein',  label: 'Protein',     unit: 'g' },
    { key: 'fat',      label: 'Fat',         unit: 'g' },
    { key: 'carbs',    label: 'Carbs',       unit: 'g' },
    { key: 'calories', label: 'Calories',    unit: 'kcal' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map(f => (
        <div key={f.key}>
          <label className="label" htmlFor={`macro-${f.key}`}>{f.label}</label>
          <div className="relative">
            <NumberField
              id={`macro-${f.key}`}
              className="input pr-10"
              value={targets[f.key]}
              onCommit={n => onChange({ ...targets, [f.key]: n })}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
              {f.unit}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Supplement Manager ────────────────────────────────────────────────────────

function SupplementManager({ supplements, onChange }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', timing: 'morning-empty' });

  function handleAdd(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const newSupp = {
      id: 's' + Date.now(),
      name: form.name.trim(),
      timing: form.timing,
      active: true,
    };
    onChange([...supplements, newSupp]);
    setForm({ name: '', timing: 'morning-empty' });
    setAdding(false);
  }

  function handleRemove(id) {
    onChange(supplements.filter(s => s.id !== id));
  }

  function handleToggleActive(id) {
    onChange(supplements.map(s => s.id === id ? { ...s, active: !s.active } : s));
  }

  function handleTimingChange(id, timing) {
    onChange(supplements.map(s => s.id === id ? { ...s, timing } : s));
  }

  return (
    <div className="space-y-2">
      {supplements.map(supp => (
        <div key={supp.id} className={`flex items-center gap-2 py-1.5 px-2 rounded-xl border transition-colors ${supp.active ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50'}`}>
          <input
            type="checkbox"
            className="checkbox-brand shrink-0"
            checked={supp.active}
            onChange={() => handleToggleActive(supp.id)}
            aria-label={`Track ${supp.name}`}
            title="Toggle active"
          />
          <span className={`text-sm flex-1 min-w-0 break-words ${supp.active ? 'text-slate-800' : 'text-slate-500 line-through'}`}>
            {supp.name}
          </span>
          <select
            value={supp.timing}
            onChange={e => handleTimingChange(supp.id, e.target.value)}
            aria-label={`When to take ${supp.name}`}
            className="min-w-0 max-w-[48%] text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
          >
            {TIMING_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={() => handleRemove(supp.id)}
            className="text-slate-500 hover:text-red-500 transition-colors p-2 rounded min-w-[40px] min-h-[40px]"
            aria-label={`Remove ${supp.name}`}
            title="Remove"
          >✕</button>
        </div>
      ))}

      {adding ? (
        <form onSubmit={handleAdd} className="flex gap-2 mt-2">
          <input
            autoFocus
            className="input text-sm flex-1"
            placeholder="Supplement name"
            aria-label="Supplement name"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
          <select
            value={form.timing}
            onChange={e => setForm(f => ({ ...f, timing: e.target.value }))}
            aria-label="When to take it"
            className="text-sm border border-slate-200 rounded-xl px-3 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            {TIMING_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button type="submit" className="btn-primary text-xs px-3 py-2">Add</button>
          <button type="button" onClick={() => setAdding(false)} className="btn-secondary text-xs px-3 py-2">Cancel</button>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="btn-ghost text-xs">
          + Add supplement
        </button>
      )}
    </div>
  );
}

// ── Exercise Goals ────────────────────────────────────────────────────────────

function ExerciseGoals({ goals, onChange }) {
  const categories = [
    { id: 'zone2',    icon: '🚴' },
    { id: 'hiit',     icon: '⚡' },
    { id: 'strength', icon: '🏋️' },
    { id: 'stretch',  icon: '🧘' },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Set a goal to 0 to stop tracking it.</p>
      {categories.map(cat => {
        const g = goals[cat.id];
        if (!g) return null;
        return (
          <div key={cat.id} className="flex items-center gap-3">
            <span className="text-base w-6">{cat.icon}</span>
            <input
              className="input text-sm flex-1"
              value={g.label}
              onChange={e => onChange({ ...goals, [cat.id]: { ...g, label: e.target.value } })}
              placeholder="Activity label"
              aria-label="Goal name"
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <NumberField
                min={0}
                max={14}
                className="input text-sm w-16 text-center"
                aria-label={`${g.label} sessions per week`}
                value={g.target}
                onCommit={n => onChange({ ...goals, [cat.id]: { ...g, target: n } })}
              />
              <span className="text-xs text-slate-500 whitespace-nowrap">×/week</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Health score targets ──────────────────────────────────────────────────────

// Blank means "not set": the matching part of the score shows as incomplete
// rather than being scored against a made-up number.
function HealthTargets({ settings, onUpdate }) {
  const range = settings.calorieRange || {};
  const groups = settings.foodGroupTargets || {};
  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500">
        Daily score = nutrition {HEALTH_SCORE_CONFIG.weights.nutrition}% · movement {HEALTH_SCORE_CONFIG.weights.movement}% ·
        sleep {HEALTH_SCORE_CONFIG.weights.sleep}%. These are design weights for tracking consistency with your own
        targets, not medical guidance. Leave a field blank and that part of the score shows as incomplete. Your protein
        target is under Daily Macro Targets.
      </p>

      <div>
        <p className="label">Calorie range (kcal / day)</p>
        <div className="flex items-center gap-2">
          <NumberField
            allowEmpty
            min={1}
            className="input text-sm w-28"
            aria-label="Minimum calories per day"
            placeholder="Min"
            value={range.min}
            onCommit={n => onUpdate({ calorieRange: { ...range, min: n } })}
          />
          <span className="text-sm text-slate-500">to</span>
          <NumberField
            allowEmpty
            min={1}
            className="input text-sm w-28"
            aria-label="Maximum calories per day"
            placeholder="Max"
            value={range.max}
            onCommit={n => onUpdate({ calorieRange: { ...range, max: n } })}
          />
        </div>
        <p className="text-xs text-slate-500 mt-1">Full points inside the range; fewer above it or below it.</p>
      </div>

      <div>
        <label className="label" htmlFor="steps-target">Daily steps target</label>
        <NumberField
          id="steps-target"
          allowEmpty
          min={1}
          className="input text-sm w-36"
          placeholder="e.g. 10000"
          value={settings.stepsTarget}
          onCommit={n => onUpdate({ stepsTarget: n })}
        />
      </div>

      <div>
        <p className="label">Food groups (servings / day)</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {HEALTH_SCORE_CONFIG.foodGroups.map(g => (
            <div key={g.key}>
              <label className="block text-xs text-slate-600 mb-1" htmlFor={`fg-${g.key}`}>{g.label}</label>
              <NumberField
                id={`fg-${g.key}`}
                allowEmpty
                min={1}
                max={20}
                className="input text-sm"
                placeholder="Not tracked"
                value={groups[g.key]}
                onCommit={n => onUpdate({ foodGroupTargets: { ...groups, [g.key]: n } })}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Servings are estimated from your meals by Claude, and you can adjust them each day.
        </p>
      </div>

      <WeeklyPlan settings={settings} onUpdate={onUpdate} />
    </div>
  );
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Each weekday is planned sessions or a recovery day. Edits start tomorrow,
// so a day's plan is always set before it begins.
function WeeklyPlan({ settings, onUpdate }) {
  const days = upcomingPlanDays(settings.planHistory);
  const startsOn = formatShort(offsetDate(today(), 1));

  function toggle(weekday, key) {
    const current = days[weekday] || [];
    let next;
    if (key === 'recovery') next = current.includes('recovery') ? [] : ['recovery'];
    else {
      const withoutRecovery = current.filter(k => k !== 'recovery');
      next = withoutRecovery.includes(key) ? withoutRecovery.filter(k => k !== key) : [...withoutRecovery, key];
    }
    onUpdate({ planHistory: editPlan(settings.planHistory, days.map((d, i) => (i === weekday ? next : d))) });
  }

  // Planned sessions per week vs the weekly goals
  const counts = {};
  for (const d of days) for (const k of d) counts[k] = (counts[k] || 0) + 1;
  const goals = settings.exerciseGoals || {};
  const summary = PLAN_OPTIONS.filter(o => o.key !== 'recovery' && (counts[o.key] || goals[o.key]?.target))
    .map(o => `${o.label} ${counts[o.key] || 0}${goals[o.key]?.target ? `/${goals[o.key].target}` : ''}`);

  return (
    <div>
      <p className="label">Weekly plan</p>
      <p className="text-xs text-slate-500 mb-2">
        Changes apply from tomorrow ({startsOn}), so each day is planned in advance. A planned recovery day earns full
        plan points without a workout.
      </p>
      <div className="space-y-2">
        {WEEKDAYS.map((name, i) => (
          <div key={name} className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm text-slate-700 w-24 shrink-0">{name}</span>
            {PLAN_OPTIONS.map(o => {
              const on = (days[i] || []).includes(o.key);
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => toggle(i, o.key)}
                  aria-pressed={on}
                  aria-label={`${name}: ${o.label}`}
                  className={`text-xs px-2.5 py-1.5 rounded-full border font-medium transition-colors ${
                    on ? 'bg-brand-700 text-white border-brand-700' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
            {!(days[i] || []).length && <span className="text-[11px] text-slate-500">Not planned</span>}
          </div>
        ))}
      </div>
      {summary.length > 0 && (
        <p className="text-xs text-slate-600 mt-2">Planned per week vs goals: {summary.join(' · ')}</p>
      )}
    </div>
  );
}

// ── AI Settings Assistant ─────────────────────────────────────────────────────

function AIAssistant({ settings, onApply }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  async function handleAsk() {
    const msg = input.trim();
    if (!msg) return;
    setError('');
    setPreview(null);
    setLoading(true);
    try {
      const patch = await applySettingsIntent(msg, settings);
      setPreview(patch);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (!preview) return;
    onApply(preview);
    setPreview(null);
    setInput('');
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Describe a change in plain English and the AI will update your settings.
        <br />
        <span className="text-slate-500">
          e.g. "Set my protein target to 200g" · "Add CoQ10 to morning supplements" · "Change zone 2 goal to 4 sessions"
        </span>
      </p>

      <div className="flex gap-2">
        <input
          className="input text-sm flex-1"
          placeholder="Describe a settings change..."
          aria-label="Describe a settings change"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && handleAsk()}
          disabled={loading}
        />
        <button
          onClick={handleAsk}
          disabled={loading || !input.trim()}
          className="btn-primary text-xs px-3 shrink-0"
        >
          {loading ? (
            <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : 'Apply'}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg">{error}</p>
      )}

      {preview && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-3 space-y-2">
          <p className="text-xs font-semibold text-brand-700">Proposed changes:</p>
          <pre className="text-xs text-slate-700 bg-white rounded-lg p-2 overflow-auto max-h-36">
            {JSON.stringify(preview, null, 2)}
          </pre>
          <div className="flex gap-2">
            <button onClick={handleApply} className="btn-primary text-xs py-1.5 px-3">Apply changes</button>
            <button onClick={() => setPreview(null)} className="btn-secondary text-xs py-1.5 px-3">Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sync & Oura ───────────────────────────────────────────────────────────────

function SyncSettings({ settings, onUpdate, markSaved }) {
  const [syncStatus, setSyncStatus] = useState(sync.getStatus());
  const [ouraTest, setOuraTest] = useState(null); // null | 'testing' | 'ok' | error string

  useEffect(() => sync.onStatusChange(setSyncStatus), []);

  async function handleSyncNow() {
    const result = await sync.syncNow();
    if (result.pulled) window.location.reload(); // re-init views from merged data
  }

  async function handleTestOura() {
    setOuraTest('testing');
    try {
      await oura.testOuraConnection();
      setOuraTest('ok');
    } catch (e) {
      setOuraTest(e.message);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="oura-client-id">Oura Client ID</label>
            <input
              id="oura-client-id"
              className="input text-sm font-mono"
              placeholder="From your Oura application"
              value={settings.ouraClientId || ''}
              onChange={e => { onUpdate({ ouraClientId: e.target.value.trim() }); markSaved(); setOuraTest(null); }}
            />
          </div>
          <div>
            <label className="label" htmlFor="oura-client-secret">Oura Client Secret</label>
            <input
              id="oura-client-secret"
              type="password"
              className="input text-sm font-mono"
              placeholder="Client secret"
              value={settings.ouraClientSecret || ''}
              onChange={e => { onUpdate({ ouraClientSecret: e.target.value.trim() }); markSaved(); setOuraTest(null); }}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => oura.beginOuraAuth()}
            disabled={!settings.ouraClientId || !settings.ouraClientSecret}
            className="btn-primary text-xs px-3"
          >
            {oura.isConnected() ? '🔄 Reconnect Oura' : '💍 Connect Oura'}
          </button>
          {oura.isConnected() && (
            <>
              <button
                onClick={handleTestOura}
                disabled={ouraTest === 'testing'}
                className="btn-secondary text-xs px-3"
              >
                {ouraTest === 'testing' ? 'Testing…' : 'Test'}
              </button>
              <button
                onClick={() => { oura.disconnectOura(); markSaved(); setOuraTest(null); }}
                className="btn-ghost text-xs px-3"
              >
                Disconnect
              </button>
            </>
          )}
          {oura.isConnected() && ouraTest === null && (
            <span className="text-xs text-brand-600">✓ Connected</span>
          )}
          {ouraTest === 'ok' && <span className="text-xs text-brand-600">✓ Oura responded — all good</span>}
          {ouraTest && ouraTest !== 'ok' && ouraTest !== 'testing' && (
            <span className="text-xs text-red-500">{ouraTest}</span>
          )}
        </div>
        <p className="text-xs text-slate-500">
          Pulls daily sleep and readiness. Create an application at{' '}
          <a href="https://cloud.ouraring.com/oauth/applications" target="_blank" rel="noreferrer" className="text-brand-500 hover:underline">
            cloud.ouraring.com
          </a>{' '}
          with this site's URL as the redirect URI, then paste its Client ID and Secret here
          and hit Connect — you'll approve access on Oura's page and land back here.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="sync-key">Device Sync Key</label>
        <div className="flex gap-2">
          <input
            id="sync-key"
            type="password"
            className="input text-sm font-mono flex-1"
            placeholder="Shared passphrase for cross-device sync"
            value={settings.syncKey || ''}
            onChange={e => { onUpdate({ syncKey: e.target.value.trim() }); markSaved(); }}
          />
          <button
            onClick={handleSyncNow}
            disabled={!settings.syncKey || syncStatus.state === 'syncing'}
            className="btn-secondary text-xs px-3 shrink-0"
          >
            {syncStatus.state === 'syncing' ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
        <p className="text-xs mt-1.5">
          {syncStatus.state === 'error' && <span className="text-red-500">{syncStatus.error}</span>}
          {syncStatus.state !== 'error' && syncStatus.lastSyncedAt && (
            <span className="text-slate-500">Last synced {new Date(syncStatus.lastSyncedAt).toLocaleTimeString()}</span>
          )}
          {syncStatus.state !== 'error' && !syncStatus.lastSyncedAt && (
            <span className="text-slate-500">
              Enter the same key on each device to share one dataset. Must match the SYNC_KEY secret on Cloudflare.
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

// ── Main Settings View ────────────────────────────────────────────────────────

export default function SettingsView({ settings, onUpdate, onReplace }) {
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef(null);

  // One toast that stays up while you keep editing, rather than a new timer
  // (and flicker) per keystroke
  function markSaved() {
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1500);
  }

  function handleApplyAIPatch(patch) {
    // Deep-merge the patch; for arrays (supplements) replace the entire array
    const next = { ...settings, ...patch };
    if (patch.macroTargets) next.macroTargets = { ...settings.macroTargets, ...patch.macroTargets };
    if (patch.exerciseGoals) next.exerciseGoals = mergeGoals(settings.exerciseGoals, patch.exerciseGoals);
    onReplace(next);
    markSaved();
  }

  return (
    <div className="space-y-4">
      {/* API Key */}
      <Section title="🔑 Anthropic API Key">
        <div>
          <label className="label" htmlFor="api-key">API Key</label>
          <input
            id="api-key"
            type="password"
            className="input text-sm font-mono"
            placeholder="sk-ant-..."
            value={settings.apiKey || ''}
            onChange={e => { onUpdate({ apiKey: e.target.value }); markSaved(); }}
          />
          <p className="text-xs text-slate-500 mt-1.5">
            Used for meal macro parsing via Claude Haiku. Get yours at{' '}
            <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="text-brand-500 hover:underline">
              console.anthropic.com
            </a>.
            Stored on this device only and never synced, so enter a key on each device.
          </p>
        </div>
      </Section>

      {/* Oura + device sync */}
      <Section title="💍 Oura & Device Sync">
        <SyncSettings settings={settings} onUpdate={onUpdate} markSaved={markSaved} />
      </Section>

      {/* Macro Targets */}
      <Section title="🎯 Daily Macro Targets">
        <MacroTargets
          targets={settings.macroTargets}
          onChange={t => { onUpdate({ macroTargets: t }); markSaved(); }}
        />
      </Section>

      {/* Supplements */}
      <Section title="💊 Supplements, Vitamins & Hydration">
        <div>
          <label className="label" htmlFor="water-target">Water Target</label>
          <div className="flex items-center gap-2 mb-4">
            <NumberField
              id="water-target"
              min={1}
              max={20}
              className="input text-sm w-20"
              value={settings.waterTarget}
              onCommit={n => { onUpdate({ waterTarget: n }); markSaved(); }}
            />
            <span className="text-sm text-slate-500">glasses / day</span>
          </div>
        </div>
        <SupplementManager
          supplements={settings.supplements}
          onChange={s => { onUpdate({ supplements: s }); markSaved(); }}
        />
      </Section>

      {/* Health score targets */}
      <Section title="📊 Health Score Targets">
        <HealthTargets settings={settings} onUpdate={patch => { onUpdate(patch); markSaved(); }} />
      </Section>

      {/* Exercise Goals */}
      <Section title="🏋️ Weekly Exercise Goals">
        <ExerciseGoals
          goals={settings.exerciseGoals}
          onChange={g => { onUpdate({ exerciseGoals: g }); markSaved(); }}
        />
      </Section>

      {/* AI Assistant */}
      <Section title="🤖 AI Settings Assistant">
        <AIAssistant settings={settings} onApply={handleApplyAIPatch} />
      </Section>

      {/* Save indicator */}
      <div role="status" aria-live="polite">
        {saved && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-4 py-2 rounded-full shadow-lg transition-opacity">
            ✓ Settings saved
          </div>
        )}
      </div>
    </div>
  );
}

function mergeGoals(base, patch) {
  const result = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    result[k] = { ...(base[k] || {}), ...v };
  }
  return result;
}
