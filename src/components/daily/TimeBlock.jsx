import { useState } from 'react';

// Blocks in day order. endHour is when each block hands over to the next;
// mid-day runs to 5 pm so the afternoon isn't left without a block.
export const BLOCK_ORDER = ['morning', 'midmorning', 'midday', 'evening'];

const BLOCK_META = {
  morning:     { label: 'Morning',     time: '6–10 am',  endHour: 10, accent: 'border-brand-400', bg: 'bg-brand-50',  icon: '🌅' },
  midmorning:  { label: 'Mid-Morning', time: '10–12 pm', endHour: 12, accent: 'border-amber-400', bg: 'bg-amber-50',  icon: '☀️' },
  midday:      { label: 'Mid-Day',     time: '12–5 pm',  endHour: 17, accent: 'border-sky-400',   bg: 'bg-sky-50',    icon: '🌤️' },
  evening:     { label: 'Evening',     time: '5–10 pm',  endHour: 24, accent: 'border-violet-400',bg: 'bg-violet-50', icon: '🌙' },
};

/** The block `now` falls in (before 6 am still counts as morning). */
export function currentBlock(now = new Date()) {
  const hour = now.getHours();
  return BLOCK_ORDER.find(id => hour < BLOCK_META[id].endHour);
}

// `summary` is shown in the header while the block is collapsed.
export default function TimeBlock({ id, children, defaultOpen = true, summary }) {
  const meta = BLOCK_META[id] || { label: id, time: '', accent: 'border-slate-300', bg: 'bg-slate-50', icon: '🕐' };
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`card border-l-4 ${meta.accent} py-4`}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={`block-${id}`}
        className="w-full flex items-center gap-2 text-left -mt-1 mb-1 group"
      >
        <span className="text-base" aria-hidden="true">{meta.icon}</span>
        <span className="font-semibold text-slate-800 text-sm shrink-0">{meta.label}</span>
        <span className="text-xs text-slate-500 ml-1 shrink-0">{meta.time}</span>
        {!open && summary && (
          <span className="text-xs text-slate-500 ml-2 truncate min-w-0">· {summary}</span>
        )}
        <span
          aria-hidden="true"
          className={`ml-auto shrink-0 text-slate-500 text-xs transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          ▾
        </span>
      </button>

      {/* Content */}
      {open && (
        <div id={`block-${id}`} className="space-y-4 mt-3">
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
