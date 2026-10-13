import { clearLastOrder } from '../utils/checkout'
import { clearSession } from './session'
import { getSupabase } from './supabase'

// Ends the session on this device. The Supabase call is not awaited: the UI must not wait on the network.
export function signOut() {
  void getSupabase().then((supabase) => supabase.auth.signOut()).catch(() => {})
  clearSession()
  clearLastOrder() // an order's address and phone must not outlive the session
}
