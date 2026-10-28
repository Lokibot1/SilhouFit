// Signs in the saved staff and admin accounts without Supabase (see SIMULATED_AUTH). Only reached through a dynamic import behind that flag.
import { canSkipPasswordChange } from '../config/accountPolicy'
import { getAccounts, updateAccounts } from './accountStore'
import { MeError, type Me } from './fetchMe'
import type { Session } from './session'
import type { SignInResult } from './signIn'

const find = (email: string) => [...getAccounts().staff, ...getAccounts().admins].find((account) => account.email.toLowerCase() === email)

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
    const saved = [...draft.staff, ...draft.admins].find((a) => a.id === account.id)
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
      mustChangePassword: account.mustChangePassword,
    },
  }
}

/** The signed-in simulated account as GET /users/me would return it. */
export function simulatedMe(session: Pick<Session, 'accountId'>): Me {
  const account = [...getAccounts().staff, ...getAccounts().admins].find((a) => a.id === session.accountId)
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
    mustChangePassword: account.mustChangePassword,
    passwordChangeSkippable: canSkipPasswordChange(account),
  }
}
