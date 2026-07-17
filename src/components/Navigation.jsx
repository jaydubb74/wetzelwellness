const TABS = [
  { id: 'daily',       label: 'Daily',       icon: '📋' },
  { id: 'progression', label: 'Progression',  icon: '📈' },
  { id: 'settings',    label: 'Settings',     icon: '⚙️'  },
];

export default function Navigation({ activeTab, onTabChange }) {
  return (
    <nav className="bg-white border-b border-slate-100">
      <div className="max-w-2xl mx-auto px-4 flex gap-1">
        {TABS.map(tab => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-150
                ${active
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }
              `}
            >
              <span className="text-base leading-none">{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
