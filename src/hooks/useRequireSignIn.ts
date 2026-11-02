import { useLocation, useNavigate } from 'react-router-dom'
import { useToast } from '../components/toast/useToast'
import { useCurrentUser } from './useCurrentUser'

/** For actions only a signed-in shopper can take. A guest is sent to sign in and back to this page; the action is not repeated. */
export function useRequireSignIn() {
  const user = useCurrentUser()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const toast = useToast()
  return (what: string) => {
    if (user) return false
    toast.show({ kind: 'info', message: `Sign in to ${what}.` })
    navigate(`/login?next=${encodeURIComponent(pathname + search)}`)
    return true
  }
}
