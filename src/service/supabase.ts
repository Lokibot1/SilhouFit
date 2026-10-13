import type { SupabaseClient } from '@supabase/supabase-js'

let client: Promise<SupabaseClient> | undefined

// Lazy so a missing env var surfaces when someone signs in, not at load, and supabase-js stays out of the main chunk.
// PKCE keeps Google's tokens out of the URL: the callback carries a one-time `code`, exchanged once at client creation.
export function getSupabase() {
  client ??= import('@supabase/supabase-js')
    .then(({ createClient }) =>
      createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
        auth: { flowType: 'pkce' },
      }),
    )
    .catch((error: unknown) => {
      client = undefined
      throw error
    })
  return client
}
