import { useState } from 'react';

const BLOCK_META = {
  morning:     { label: 'Morning',     time: '6–10 am',  accent: 'border-brand-400', bg: 'bg-brand-50',  icon: '🌅' },
  midmorning:  { label: 'Mid-Morning', time: '10–12 pm', accent: 'border-amber-400', bg: 'bg-amber-50',  icon: '☀️' },
  midday:      { label: 'Mid-Day',     time: '12–3 pm',  accent: 'border-sky-400',   bg: 'bg-sky-50',    icon: '🌤️' },
  evening:     { label: 'Evening',     time: '5–10 pm',  accent: 'border-violet-400',bg: 'bg-violet-50', icon: '🌙' },
};

export default function TimeBlock({ id, children, defaultOpen = true }) {
  const meta = BLOCK_META[id] || { label: id, time: '', accent: 'border-slate-300', bg: 'bg-slate-50', icon: '🕐' };
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`card border-l-4 ${meta.accent} py-4`}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 text-left -mt-1 mb-1 group"
      >
        <span className="text-base">{meta.icon}</span>
        <span className="font-semibold text-slate-800 text-sm">{meta.label}</span>
        <span className="text-xs text-slate-400 ml-1">{meta.time}</span>
        <span className={`ml-auto text-slate-400 text-xs transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>

      {/* Content */}
      {open && (
        <div className="space-y-4 mt-3">
          {children}
        </div>
      )}
    </div>
  );
}

// Section divider within a time block
export function BlockSection({ title, children }) {
  return (
    <div>
      <p className="label">{title}</p>
      {children}
    </div>
  );
}
