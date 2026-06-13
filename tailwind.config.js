/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:        'var(--bg)',
        surface:   'var(--surface)',
        text:      'var(--text)',
        'text-soft': 'var(--text-soft)',
        line:      'var(--line)',
        'c-birth': 'var(--c-birth)',
        'c-death': 'var(--c-death)',
        'c-event': 'var(--c-event)',
        'c-org':   'var(--c-org)',
        'c-pub':   'var(--c-pub)',
        'c-war':   'var(--c-war)',
        'c-disc':  'var(--c-disc)',
        'c-other': 'var(--c-other)',
      },
      fontFamily: {
        display: ['Archivo', 'Helvetica', 'Arial', 'sans-serif'],
        mono:    ['Space Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
