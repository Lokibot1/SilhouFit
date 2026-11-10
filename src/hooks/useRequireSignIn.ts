import { useLocation, useNavigate } from 'react-router-dom'
import { useOpenLoginModal } from '../components/auth/LoginModal'
import { useToast } from '../components/toast/useToast'
import { useCurrentUser } from './useCurrentUser'

/** For actions only a signed-in shopper can take. A guest gets the sign-in modal over this page (or the login page where there is no modal); the action is not repeated. */
export function useRequireSignIn() {
  const user = useCurrentUser()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const toast = useToast()
  const openLogin = useOpenLoginModal()
  return (what: string) => {
    if (user) return false
    toast.show({ kind: 'info', message: `Sign in to ${what}.` })
    if (openLogin) openLogin()
    else navigate(`/login?next=${encodeURIComponent(pathname + search)}`)
    return true
  }
}
