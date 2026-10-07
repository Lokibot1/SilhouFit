import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react'
import { flushSync } from 'react-dom'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'silhoufit-theme'

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

interface ThemeContextValue {
  theme: Theme
  toggleTheme: (origin?: { x: number; y: number }) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  // Layout effect so the class flips inside flushSync, before the View Transition snapshot.
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggleTheme = useCallback((origin?: { x: number; y: number }) => {
    const flip = () =>
      setTheme((current) => (current === 'dark' ? 'light' : 'dark'))

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    if (reduceMotion || !document.startViewTransition) {
      flip()
      return
    }

    const { x, y } = origin ?? {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    }
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    )

    const root = document.documentElement
    root.style.setProperty('--theme-toggle-x', `${x}px`)
    root.style.setProperty('--theme-toggle-y', `${y}px`)
    root.style.setProperty('--theme-toggle-radius', `${radius}px`)

    document.startViewTransition(() => flushSync(flip))
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
