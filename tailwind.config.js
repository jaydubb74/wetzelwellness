/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
      },
      colors: {
        brand: {
          50:  'rgb(var(--c-brand-50) / <alpha-value>)',
          100: 'rgb(var(--c-brand-100) / <alpha-value>)',
          200: 'rgb(var(--c-brand-200) / <alpha-value>)',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: 'rgb(var(--c-brand-600) / <alpha-value>)',
          700: 'rgb(var(--c-brand-700) / <alpha-value>)',
          800: 'rgb(var(--c-brand-800) / <alpha-value>)',
        },
        // Themed shades read CSS variables set in index.css (light + dark)
        white: 'rgb(var(--c-white) / <alpha-value>)',
        slate: {
          50:  'rgb(var(--c-slate-50) / <alpha-value>)',
          100: 'rgb(var(--c-slate-100) / <alpha-value>)',
          200: 'rgb(var(--c-slate-200) / <alpha-value>)',
          300: 'rgb(var(--c-slate-300) / <alpha-value>)',
          400: 'rgb(var(--c-slate-400) / <alpha-value>)',
          500: 'rgb(var(--c-slate-500) / <alpha-value>)',
          600: 'rgb(var(--c-slate-600) / <alpha-value>)',
          700: 'rgb(var(--c-slate-700) / <alpha-value>)',
          800: 'rgb(var(--c-slate-800) / <alpha-value>)',
          900: 'rgb(var(--c-slate-900) / <alpha-value>)',
        },
        amber: {
          50:  'rgb(var(--c-amber-50) / <alpha-value>)',
          100: 'rgb(var(--c-amber-100) / <alpha-value>)',
          200: 'rgb(var(--c-amber-200) / <alpha-value>)',
          600: 'rgb(var(--c-amber-600) / <alpha-value>)',
          700: 'rgb(var(--c-amber-700) / <alpha-value>)',
          800: 'rgb(var(--c-amber-800) / <alpha-value>)',
          900: 'rgb(var(--c-amber-900) / <alpha-value>)',
        },
        sky: {
          50:  'rgb(var(--c-sky-50) / <alpha-value>)',
          600: 'rgb(var(--c-sky-600) / <alpha-value>)',
          700: 'rgb(var(--c-sky-700) / <alpha-value>)',
        },
        indigo: {
          50:  'rgb(var(--c-indigo-50) / <alpha-value>)',
          100: 'rgb(var(--c-indigo-100) / <alpha-value>)',
          900: 'rgb(var(--c-indigo-900) / <alpha-value>)',
        },
        teal: {
          50:  'rgb(var(--c-teal-50) / <alpha-value>)',
          100: 'rgb(var(--c-teal-100) / <alpha-value>)',
          900: 'rgb(var(--c-teal-900) / <alpha-value>)',
        },
        violet: {
          50:  'rgb(var(--c-violet-50) / <alpha-value>)',
          600: 'rgb(var(--c-violet-600) / <alpha-value>)',
        },
        red: {
          50:  'rgb(var(--c-red-50) / <alpha-value>)',
          500: 'rgb(var(--c-red-500) / <alpha-value>)',
          600: 'rgb(var(--c-red-600) / <alpha-value>)',
        },
        rose: {
          50:  'rgb(var(--c-rose-50) / <alpha-value>)',
          200: 'rgb(var(--c-rose-200) / <alpha-value>)',
          600: 'rgb(var(--c-rose-600) / <alpha-value>)',
        },
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'card-md': '0 4px 6px -1px rgb(0 0 0 / 0.06), 0 2px 4px -2px rgb(0 0 0 / 0.04)',
      },
    },
  },
  plugins: [],
};
