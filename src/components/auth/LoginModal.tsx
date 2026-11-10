import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import './KralType.css'
import { useSignUpForm } from '../../hooks/useSignUpForm'
import { Modal } from '../ui/Modal'
import { LoginForm } from './LoginForm'
import { SignUpForm } from './SignUpForm'

const LoginModalContext = createContext<(() => void) | null>(null)

/** Opens the sign-in modal over the current page, or null outside the provider (the caller then goes to the login page). */
export const useOpenLoginModal = () => useContext(LoginModalContext)

type View = 'login' | 'signup'

// Mounted only while the sign-up view is showing, so closing the modal or going back to login drops what was typed.
function SignUpInModal({ next, onSwitch, onClose }: { next: string; onSwitch: () => void; onClose: () => void }) {
  const form = useSignUpForm({ next })
  return <SignUpForm form={form} nextParam={next} modal onSwitch={onSwitch} onClose={onClose} />
}

/** Lets any page ask a guest to sign in or sign up without leaving: they finish in the modal and carry on where they were. */
export function LoginModalProvider({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation()
  const [view, setView] = useState<View | null>(null)
  const openLogin = useCallback(() => setView('login'), [])
  const close = useCallback(() => setView(null), [])
  // The title and form stay put while the modal fades out.
  const [shown, setShown] = useState<View>('login')
  useEffect(() => {
    if (view) setShown(view)
  }, [view])

  // Any navigation (a link out of the modal, the legal pages) closes it.
  useEffect(() => setView(null), [pathname])

  const next = pathname + search
  return (
    <LoginModalContext.Provider value={openLogin}>
      {children}
      <Modal open={view !== null} onClose={close} title={shown === 'login' ? 'Sign in' : 'Sign up'} size="sm" tone="kral">
        <div className="kral-type pb-6">
          {shown === 'login' ? (
            <LoginForm modal nextParam={next} onSignedIn={close} onSwitch={() => setView('signup')} />
          ) : (
            <SignUpInModal next={next} onSwitch={() => setView('login')} onClose={close} />
          )}
        </div>
      </Modal>
    </LoginModalContext.Provider>
  )
}
