import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'chronograph-theme';
const THEMES: Theme[] = ['dark', 'light'];

/** Read the theme already applied to <html> by the pre-paint init script. */
function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/**
 * Segmented Dark / Light control. The active option is filled; selecting a
 * theme drives the `data-theme` attribute on <html> (CSS does the rest) and
 * persists the choice.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  // Apply the chosen theme to the document root (the init script set the first
  // value pre-paint; this keeps it in sync on every change).
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function choose(next: Theme) {
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    setTheme(next);
  }

  return (
    <div className="theme-toggle" role="group" aria-label="Colour theme">
      {THEMES.map(t => (
        <button
          key={t}
          type="button"
          className="theme-toggle-opt"
          data-active={theme === t ? 'true' : 'false'}
          aria-pressed={theme === t}
          onClick={() => choose(t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
