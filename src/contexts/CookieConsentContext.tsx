import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'

type ConsentStatus = 'accepted' | 'rejected' | null

const STORAGE_KEY = 'silhoufit-cookie-consent'

interface CookieConsentContextValue {
  status: ConsentStatus
  accept: () => void
  reject: () => void
}

const CookieConsentContext = createContext<CookieConsentContextValue | null>(
  null,
)

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConsentStatus>(
    () => localStorage.getItem(STORAGE_KEY) as ConsentStatus,
  )

  const accept = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'accepted')
    setStatus('accepted')
  }, [])

  const reject = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'rejected')
    setStatus('rejected')
  }, [])

  return (
    <CookieConsentContext.Provider value={{ status, accept, reject }}>
      {children}
    </CookieConsentContext.Provider>
  )
}

export function useCookieConsent() {
  const context = useContext(CookieConsentContext)
  if (!context)
    throw new Error(
      'useCookieConsent must be used within CookieConsentProvider',
    )
  return context
}
