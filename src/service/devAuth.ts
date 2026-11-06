// Signs in the saved staff and admin accounts without Supabase (see SIMULATED_AUTH). Only reached through a dynamic import behind that flag.
import { getAccounts, updateAccounts } from './accountStore'
import { MeError, type Me } from './fetchMe'
import type { Session } from './session'
import type { SignInResult } from './signIn'

type Draft = ReturnType<typeof getAccounts>
const everyone = (accounts: Draft) => [...accounts.staff, ...accounts.admins, ...accounts.superadmins]
const find = (email: string) => everyone(getAccounts()).find((account) => account.email.toLowerCase() === email)

/**
 * The result for an email that belongs to a saved account, or null for any other email so the real sign-in takes over.
 * A wrong password reads as 'invalid', and 'archived' is only said to someone who has the right password, so emails are not revealed.
 */
export function trySimulatedSignIn(email: string, password: string): SignInResult | null {
  const account = find(email)
  if (!account) return null
  if (getAccounts().passwords[account.id] !== password) return { ok: false, reason: 'invalid' }
  if (account.status === 'archived') return { ok: false, reason: 'archived' }
  updateAccounts((draft) => {
    const saved = everyone(draft).find((a) => a.id === account.id)
    if (saved) saved.lastSignInAt = new Date().toISOString()
  })
  return {
    ok: true,
    user: {
      name: `${account.firstName} ${account.lastName}`,
      email: account.email,
      role: account.role,
      simulated: true,
      accountId: account.id,
    },
  }
}

/** The signed-in simulated account as GET /users/me would return it. */
export function simulatedMe(session: Pick<Session, 'accountId'>): Me {
  const account = everyone(getAccounts()).find((a) => a.id === session.accountId)
  if (!account) throw new MeError('unauthorized')
  return {
    id: account.id,
    email: account.email,
    role: account.role,
    firstName: account.firstName,
    middleName: null,
    lastName: account.lastName,
    suffix: null,
    fullName: `${account.firstName} ${account.lastName}`,
    avatarUrl: null,
    birthday: null,
    gender: null,
    createdAt: account.createdAt,
    updatedAt: account.createdAt,
    status: account.status,
    phone: account.phone || undefined,
  }
}
