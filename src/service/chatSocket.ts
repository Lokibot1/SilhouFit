import type { Socket } from 'socket.io-client'
import { SIMULATED_AUTH } from '../config/accountPolicy'
import { ChatError } from './chatApi'
import { getSession } from './session'
import { getSupabase } from './supabase'

let socket: Promise<Socket> | undefined

/**
 * The one chat connection (namespace /chat), shared by the thread, the inbox and the unread badge. socket.io-client is loaded on first use so it
 * stays out of the main chunk. The token is read at every (re)connect, and a refreshed token reconnects so the server sees the new one.
 */
export function getChatSocket() {
  // A dev account has no token the server would accept, so no connection is attempted (the same rule as `call()` in chatApi).
  if (SIMULATED_AUTH && getSession()?.simulated) return Promise.reject(new ChatError('simulated'))
  socket ??= (async () => {
    const [{ io }, supabase] = await Promise.all([import('socket.io-client'), getSupabase()])
    const instance = io(`${import.meta.env.VITE_API_URL}/chat`, {
      auth: (send) => {
        void supabase.auth.getSession().then(({ data }) => send({ token: data.session?.access_token }))
      },
    })
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED') instance.disconnect().connect()
      if (event === 'SIGNED_OUT') {
        instance.disconnect()
        data.subscription.unsubscribe()
        socket = undefined
      }
    })
    return instance
  })().catch((error: unknown) => {
    socket = undefined
    throw error
  })
  return socket
}
