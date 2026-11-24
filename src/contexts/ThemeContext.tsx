import { Capacitor } from '@capacitor/core'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react'
import { flushSync } from 'react-dom'

type Theme = 'light' | 'dark'
type Preference = Theme | 'system'

const STORAGE_KEY = 'silhoufit-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function getInitialPreference(): Preference {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

interface ThemeContextValue {
  /** What is on screen now: the preference, or the OS setting while the preference is System. */
  theme: Theme
  preference: Preference
  setPreference: (preference: Preference) => void
  toggleTheme: (origin?: { x: number; y: number }) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<Preference>(getInitialPreference)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(DARK_QUERY).matches)
  const theme: Theme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  // Follow the OS only while the preference is System.
  useEffect(() => {
    if (preference !== 'system') return
    const query = window.matchMedia(DARK_QUERY)
    const sync = () => setSystemDark(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [preference])

  // Layout effect so the class flips inside flushSync, before the View Transition snapshot.
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useLayoutEffect(() => {
    localStorage.setItem(STORAGE_KEY, preference)
  }, [preference])

  useEffect(() => {
    if (Capacitor.isNativePlatform()) void import('../native').then((native) => native.syncStatusBar(theme))
  }, [theme])

  const toggleTheme = useCallback((origin?: { x: number; y: number }) => {
    // Flips what is on screen into an explicit light or dark, even from System.
    const flip = () =>
      setPreference(document.documentElement.classList.contains('dark') ? 'light' : 'dark')

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
    <ThemeContext.Provider value={{ theme, preference, setPreference, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
