const TIMING_LABELS = {
  'morning-empty':     'empty stomach',
  'with-food-morning': 'with food',
  'afternoon':         'afternoon',
  'nighttime':         'at bedtime',
};

export default function SupplementChecklist({ supplements, checked, onToggle, showHydration, water, waterTarget, electrolytes, onWater, onElectrolytes }) {
  const hasSupps = supplements.length > 0;
  const allChecked = hasSupps && supplements.every(s => checked[s.id]);

  return (
    <div className="space-y-1.5">
      {supplements.map(supp => (
        <label
          key={supp.id}
          className="flex items-center gap-3 cursor-pointer group py-1 rounded-lg hover:bg-slate-50 px-1 -mx-1 transition-colors"
        >
          <input
            type="checkbox"
            className="checkbox-brand shrink-0"
            checked={!!checked[supp.id]}
            onChange={() => onToggle(supp.id)}
          />
          <span className={`text-sm transition-colors ${checked[supp.id] ? 'line-through text-slate-500' : 'text-slate-700'}`}>
            {supp.name}
          </span>
          <span className="ml-auto text-[11px] text-slate-500 shrink-0">
            {TIMING_LABELS[supp.timing] || supp.timing}
          </span>
        </label>
      ))}

      {/* Hydration (rendered in mid-morning block) */}
      {showHydration && (
        <>
          <div className="pt-1 border-t border-slate-100 mt-1 space-y-2">
            {/* Water glasses */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600 w-28 shrink-0">
                💧 Water glasses
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onWater(water - 1)}
                  aria-label="Remove a glass of water"
                  className="w-10 h-10 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-base font-medium transition-colors"
                >−</button>
                <span aria-live="polite" className={`text-sm font-semibold w-14 text-center ${water >= waterTarget ? 'text-brand-700' : 'text-slate-800'}`}>
                  {water} / {waterTarget}
                </span>
                <button
                  onClick={() => onWater(water + 1)}
                  aria-label="Add a glass of water"
                  className="w-10 h-10 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-base font-medium transition-colors"
                >+</button>
              </div>
              {/* Dot indicators */}
              <div className="flex gap-1 flex-wrap ml-1" aria-hidden="true">
                {Array.from({ length: waterTarget }, (_, i) => (
                  <span
                    key={i}
                    className={`w-2.5 h-2.5 rounded-full transition-colors ${i < water ? 'bg-sky-400' : 'bg-slate-200'}`}
                  />
                ))}
              </div>
            </div>

            {/* Electrolytes */}
            <label className="flex items-center gap-3 cursor-pointer py-1 rounded-lg hover:bg-slate-50 px-1 -mx-1">
              <input
                type="checkbox"
                className="checkbox-brand shrink-0"
                checked={electrolytes}
                onChange={e => onElectrolytes(e.target.checked)}
              />
              <span className={`text-sm transition-colors ${electrolytes ? 'line-through text-slate-500' : 'text-slate-700'}`}>
                ⚡ Electrolytes
              </span>
            </label>
          </div>
        </>
      )}

      {!hasSupps && !showHydration && (
        <p className="text-xs text-slate-500 italic py-1">No supplements for this time block.</p>
      )}
    </div>
  );
}
