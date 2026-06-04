import { useState } from 'react';

const CATEGORIES = [
  { id: 'zone2',    label: 'Zone 2 Cardio', color: 'text-sky-600 bg-sky-50',      icon: '🚴' },
  { id: 'hiit',     label: 'HIIT',          color: 'text-rose-600 bg-rose-50',     icon: '⚡' },
  { id: 'strength', label: 'Strength',      color: 'text-violet-600 bg-violet-50', icon: '🏋️' },
  { id: 'movement', label: 'Movement',      color: 'text-amber-600 bg-amber-50',   icon: '🔥' },
  { id: 'other',    label: 'Other',         color: 'text-slate-600 bg-slate-100',  icon: '🏃' },
];

function categoryMeta(id) {
  return CATEGORIES.find(c => c.id === id) || CATEGORIES[4];
}

export default function ExerciseLogger({ exercises, goals, onAdd, onRemove }) {
  const [open, setOpen] = useState(false);           // full log-workout form
  const [movementOpen, setMovementOpen] = useState(false); // movement-goal mini-form
  const [form, setForm] = useState({ category: 'strength', type: '', duration: '' });
  const [activeCalories, setActiveCalories] = useState('');

  // Weekly counts sentinel is the last element in the array (appended by DailyView)
  const weekCounts = exercises.find(e => e._weekCounts)?._weekCounts || {};

  // ── Full workout form ──────────────────────────────────────────────────────

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.type.trim() || !form.duration) return;
    onAdd({
      category: form.category,
      type: form.type.trim(),
      duration: parseInt(form.duration, 10),
    });
    setForm({ category: 'strength', type: '', duration: '' });
    setOpen(false);
  }

  // ── Movement goal mini-form ────────────────────────────────────────────────

  function handleMovementSubmit(e) {
    e.preventDefault();
    const cal = parseInt(activeCalories, 10);
    if (!cal || cal < 1) return;
    onAdd({
      category: 'movement',
      type: 'Daily Movement Goal',
      duration: 0,
      activeCalories: cal,
    });
    setActiveCalories('');
    setMovementOpen(false);
  }

  return (
    <div className="space-y-3">
      {/* ── Today's sessions ────────────────────────────────────────────────── */}
      {exercises.filter(e => !e._weekCounts).map(ex => {
        const meta = categoryMeta(ex.category);
        return (
          <div key={ex.id} className="flex items-center gap-2 group">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${meta.color}`}>
              {meta.icon} {meta.label}
            </span>
            <span className="text-sm text-slate-700 flex-1">{ex.type}</span>
            <span className="text-xs text-slate-400 shrink-0">
              {ex.category === 'movement'
                ? `${ex.activeCalories ?? '–'} active cal`
                : `${ex.duration} min`}
            </span>
            <button
              onClick={() => onRemove(ex.id)}
              className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-opacity p-1 rounded"
            >✕</button>
          </div>
        );
      })}

      {/* ── Weekly progress pills (zone2 / hiit / strength only) ────────────── */}
      {goals && (
        <div className="flex flex-wrap gap-2 pt-1">
          {['zone2', 'hiit', 'strength'].map(catId => {
            const cat = CATEGORIES.find(c => c.id === catId);
            const goal = goals[catId];
            if (!goal || !cat) return null;
            const count = weekCounts[catId] || 0;
            const met = count >= goal.target;
            return (
              <div
                key={catId}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border
                  ${met ? 'bg-brand-50 border-brand-200 text-brand-700' : 'bg-white border-slate-200 text-slate-500'}`}
              >
                {cat.icon}
                <span className="font-medium">{count}/{goal.target}</span>
                <span className="text-[11px]">{goal.label}</span>
                {met && <span>✓</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Action buttons ───────────────────────────────────────────────────── */}
      {!open && !movementOpen && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setOpen(true)} className="btn-ghost text-xs">
            + Log a workout
          </button>
          <button
            onClick={() => setMovementOpen(true)}
            className="flex items-center gap-1.5 text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-lg font-medium transition-colors"
          >
            🔥 Hit Movement Goal
          </button>
        </div>
      )}

      {/* ── Movement goal mini-form ──────────────────────────────────────────── */}
      {movementOpen && (
        <form
          onSubmit={handleMovementSubmit}
          className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2"
        >
          <p className="text-xs font-semibold text-amber-800">🔥 Daily Movement Goal</p>
          <div className="flex gap-2 items-center">
            <input
              className="input text-sm flex-1"
              type="number"
              placeholder="Active calories burned"
              min="1"
              max="5000"
              value={activeCalories}
              onChange={e => setActiveCalories(e.target.value)}
              autoFocus
            />
            <span className="text-xs text-amber-700 shrink-0">active cal</span>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary text-xs py-1.5 px-3">
              Save
            </button>
            <button
              type="button"
              onClick={() => { setMovementOpen(false); setActiveCalories(''); }}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── Full workout form ────────────────────────────────────────────────── */}
      {open && (
        <form onSubmit={handleSubmit} className="bg-slate-50 rounded-xl p-3 space-y-3">
          {/* Category selector — exclude 'movement' from manual log */}
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.filter(c => c.id !== 'movement').map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setForm(f => ({ ...f, category: cat.id }))}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  form.category === cat.id
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {cat.icon} {cat.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              className="input text-sm flex-1"
              placeholder="Activity (e.g. Treadmill, Deadlifts)"
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              autoFocus
            />
            <input
              className="input text-sm w-24"
              type="number"
              placeholder="min"
              min="1"
              max="300"
              value={form.duration}
              onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
            />
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn-primary text-xs py-1.5 px-3">Save</button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary text-xs py-1.5 px-3">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
