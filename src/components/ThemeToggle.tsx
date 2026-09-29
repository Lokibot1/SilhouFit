import { useTheme } from '../contexts/ThemeContext'

const RAYS: [number, number, number, number][] = [
  [12, 1.4, 12, 3.4],
  [12, 20.6, 12, 22.6],
  [1.4, 12, 3.4, 12],
  [20.6, 12, 22.6, 12],
  [4.5, 4.5, 5.9, 5.9],
  [18.1, 18.1, 19.5, 19.5],
  [4.5, 19.5, 5.9, 18.1],
  [18.1, 5.9, 19.5, 4.5],
]

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="glass-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fg"
    >
      <svg viewBox="0 0 24 24" className="theme-icon h-4 w-4" aria-hidden="true">
        <mask id="silhoufit-moon-bite">
          <rect x="0" y="0" width="24" height="24" fill="#fff" />
          <circle className="bite" cx="21" cy="8" r="6" fill="#000" />
        </mask>
        <circle
          className="orb"
          cx="12"
          cy="12"
          r="5.6"
          fill="currentColor"
          mask="url(#silhoufit-moon-bite)"
        />
        <g className="rays" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          {RAYS.map(([x1, y1, x2, y2]) => (
            <line key={`${x1}-${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} />
          ))}
        </g>
      </svg>
    </button>
  )
}
