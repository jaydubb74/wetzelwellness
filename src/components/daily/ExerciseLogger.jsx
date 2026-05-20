import { useState } from 'react';

const CATEGORIES = [
  { id: 'zone2',    label: 'Zone 2 Cardio', color: 'text-sky-600 bg-sky-50',     icon: '🚴' },
  { id: 'hiit',     label: 'HIIT',          color: 'text-rose-600 bg-rose-50',    icon: '⚡' },
  { id: 'strength', label: 'Strength',      color: 'text-violet-600 bg-violet-50',icon: '🏋️' },
  { id: 'other',    label: 'Other',         color: 'text-slate-600 bg-slate-100', icon: '🏃' },
];

function categoryMeta(id) {
  return CATEGORIES.find(c => c.id === id) || CATEGORIES[3];
}

export default function ExerciseLogger({ exercises, goals, onAdd, onRemove }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: 'strength', type: '', duration: '' });

  // Weekly counts (passed from DailyView which aggregates from useDailyLog)
  const weekCounts = exercises._weekCounts || {};

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

  return (
    <div className="space-y-3">
      {/* Today's sessions */}
      {exercises.filter(e => !e._weekCounts).map(ex => {
        const meta = categoryMeta(ex.category);
        return (
          <div key={ex.id} className="flex items-center gap-2 group">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${meta.color}`}>
              {meta.icon} {meta.label}
            </span>
            <span className="text-sm text-slate-700 flex-1">{ex.type}</span>
            <span className="text-xs text-slate-400 shrink-0">{ex.duration} min</span>
            <button
              onClick={() => onRemove(ex.id)}
              className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-opacity p-1 rounded"
            >✕</button>
          </div>
        );
      })}

      {/* Weekly progress pills */}
      {goals && (
        <div className="flex flex-wrap gap-2 pt-1">
          {CATEGORIES.filter(c => c.id !== 'other').map(cat => {
            const goal = goals[cat.id];
            if (!goal) return null;
            const count = weekCounts[cat.id] || 0;
            const met = count >= goal.target;
            return (
              <div
                key={cat.id}
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

      {/* Add session */}
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="btn-ghost text-xs"
        >
          + Log a workout
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="bg-slate-50 rounded-xl p-3 space-y-3">
          {/* Category selector */}
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(cat => (
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
