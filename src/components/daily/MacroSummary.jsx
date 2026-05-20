function MacroBar({ label, value, target, color }) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const over = target > 0 && value > target;

  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
        <span className={`text-xs font-semibold ${over ? 'text-amber-500' : 'text-slate-700'}`}>
          {value}
          <span className="text-slate-400 font-normal">/{target}g</span>
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full macro-bar ${over ? 'bg-amber-400' : color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function MacroSummary({ meals, targets }) {
  const totals = meals.reduce(
    (acc, m) => ({
      protein:  acc.protein  + (m.macros?.protein  || 0),
      fat:      acc.fat      + (m.macros?.fat      || 0),
      carbs:    acc.carbs    + (m.macros?.carbs    || 0),
      calories: acc.calories + (m.macros?.calories || 0),
    }),
    { protein: 0, fat: 0, carbs: 0, calories: 0 }
  );

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-900">Daily Macros</h2>
        <span className="text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
          {totals.calories} / {targets.calories} kcal
        </span>
      </div>
      <div className="space-y-2.5">
        <MacroBar label="Protein" value={totals.protein} target={targets.protein} color="bg-brand-500" />
        <MacroBar label="Fat"     value={totals.fat}     target={targets.fat}     color="bg-sky-400"   />
        <MacroBar label="Carbs"   value={totals.carbs}   target={targets.carbs}   color="bg-amber-400" />
      </div>
    </div>
  );
}
