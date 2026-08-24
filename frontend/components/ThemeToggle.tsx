'use client';

import { useEffect, useState } from 'react';

// Общий переключатель тёмной темы. Тема применяется через
// html[data-admin-theme='dark'] к контейнерам с классом .theme-shell
// (см. globals.css) и работает на всех страницах: админка, гость, акты.
export default function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    setDarkMode(document.documentElement.dataset.adminTheme === 'dark');
  }, []);

  const toggleDarkMode = () => {
    const nextDarkMode = !darkMode;
    setDarkMode(nextDarkMode);
    document.documentElement.dataset.adminTheme = nextDarkMode ? 'dark' : 'light';
    try {
      localStorage.setItem('smartact-admin-theme', nextDarkMode ? 'dark' : 'light');
    } catch {
      // The theme still works for this session when storage is unavailable.
    }
  };

  return (
    <button
      type="button"
      onClick={toggleDarkMode}
      aria-pressed={darkMode}
      aria-label={darkMode ? 'Включить светлый режим' : 'Включить тёмный режим'}
      title={darkMode ? 'Светлый режим' : 'Тёмный режим'}
      className={`flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition ${
        darkMode
          ? 'bg-slate-800 text-slate-200 hover:bg-slate-700'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
      }`}
    >
      {darkMode ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 stroke-current text-amber-300" fill="none" strokeWidth="1.8">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="1.8">
          <path d="M20.5 15.1A8.5 8.5 0 0 1 8.9 3.5a8.5 8.5 0 1 0 11.6 11.6Z" />
        </svg>
      )}
      {showLabel && <span className="hidden 2xl:inline">{darkMode ? 'Светлая тема' : 'Тёмная тема'}</span>}
    </button>
  );
}
