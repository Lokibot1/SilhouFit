import { useTheme } from '../contexts/ThemeContext'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="relative flex h-8 w-14 shrink-0 items-center rounded-full border border-ink/15 bg-bone-soft px-1 transition-colors duration-150 dark:border-white/15 dark:bg-ink-line"
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full border transition-transform duration-150 ${
          isDark
            ? 'translate-x-6 border-white/70 bg-ink'
            : 'translate-x-0 border-ink bg-bone'
        }`}
      >
        <span
          aria-hidden="true"
          className={`block h-3 w-3 rounded-full ${
            isDark ? 'border border-white/70' : 'bg-ink'
          }`}
        />
      </span>
    </button>
  )
}
