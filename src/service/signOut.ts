import { clearBodyDraft } from '../components/body-setup/draft'
import { resetTour } from '../hooks/useOnboarding'
import { clearLastOrder } from '../utils/checkout'
import { clearStashedNext } from './googleAuth'
import { clearSession } from './session'
import { getSupabase } from './supabase'

// Ends the session on this device. The Supabase call is not awaited: the UI must not wait on the network.
export function signOut() {
  void getSupabase().then((supabase) => supabase.auth.signOut()).catch(() => {})
  clearSession()
  clearStashedNext() // a pending Google `next` belongs to the session that is ending
  clearLastOrder() // an order's address and phone must not outlive the session
  clearBodyDraft() // measurements must not outlive the session
  resetTour() // the next sign-in is offered the tour again
}
