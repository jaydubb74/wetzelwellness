import { useState } from 'react';
import { applySettingsIntent } from '../../services/llm.js';

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
          <label className="label">{f.label}</label>
          <div className="relative">
            <input
              type="number"
              min="0"
              className="input pr-10"
              value={targets[f.key]}
              onChange={e => onChange({ ...targets, [f.key]: parseInt(e.target.value, 10) || 0 })}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
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
            title="Toggle active"
          />
          <span className={`text-sm flex-1 ${supp.active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
            {supp.name}
          </span>
          <select
            value={supp.timing}
            onChange={e => handleTimingChange(supp.id, e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-500 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
          >
            {TIMING_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={() => handleRemove(supp.id)}
            className="text-slate-300 hover:text-red-400 transition-colors p-1 rounded"
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
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
          <select
            value={form.timing}
            onChange={e => setForm(f => ({ ...f, timing: e.target.value }))}
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
  ];

  return (
    <div className="space-y-3">
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
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                type="number"
                min="1"
                max="7"
                className="input text-sm w-16 text-center"
                value={g.target}
                onChange={e => onChange({ ...goals, [cat.id]: { ...g, target: parseInt(e.target.value, 10) || 1 } })}
              />
              <span className="text-xs text-slate-400 whitespace-nowrap">×/week</span>
            </div>
          </div>
        );
      })}
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
        <span className="text-slate-400">
          e.g. "Set my protein target to 200g" · "Add CoQ10 to morning supplements" · "Change zone 2 goal to 4 sessions"
        </span>
      </p>

      <div className="flex gap-2">
        <input
          className="input text-sm flex-1"
          placeholder="Describe a settings change..."
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

// ── Main Settings View ────────────────────────────────────────────────────────

export default function SettingsView({ settings, onUpdate, onReplace }) {
  const [saved, setSaved] = useState(false);

  function markSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
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
          <label className="label">API Key</label>
          <input
            type="password"
            className="input text-sm font-mono"
            placeholder="sk-ant-..."
            value={settings.apiKey || ''}
            onChange={e => { onUpdate({ apiKey: e.target.value }); markSaved(); }}
          />
          <p className="text-xs text-slate-400 mt-1.5">
            Used for meal macro parsing via Claude Haiku. Get yours at{' '}
            <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="text-brand-500 hover:underline">
              console.anthropic.com
            </a>.
            Stored in your browser's localStorage only.
          </p>
        </div>
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
          <label className="label">Water Target</label>
          <div className="flex items-center gap-2 mb-4">
            <input
              type="number"
              min="1"
              max="20"
              className="input text-sm w-20"
              value={settings.waterTarget}
              onChange={e => { onUpdate({ waterTarget: parseInt(e.target.value, 10) || 8 }); markSaved(); }}
            />
            <span className="text-sm text-slate-500">glasses / day</span>
          </div>
        </div>
        <SupplementManager
          supplements={settings.supplements}
          onChange={s => { onUpdate({ supplements: s }); markSaved(); }}
        />
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
      {saved && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-4 py-2 rounded-full shadow-lg transition-opacity">
          ✓ Settings saved
        </div>
      )}
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
