// The change-password call for a simulated sign-in (see SIMULATED_AUTH), answered from the saved accounts (accountStore).
import { validatePassword } from '../utils/signUpValidation'
import { updateAccounts } from './accountStore'
import { simulateRequest, type RequestOptions } from './simulateRequest'

/** `kind` lets the caller pick accurate copy. */
class AccountError extends Error {
  kind: string

  constructor(kind: string, message: string) {
    super(message)
    this.kind = kind
  }
}
class NotFoundError extends AccountError {
  constructor(what = 'account') {
    super('not-found', `No ${what} matches that ID.`)
  }
}
class ValidationError extends AccountError {
  constructor(message: string) {
    super('validation', message)
  }
}
class WrongPasswordError extends AccountError {
  constructor() {
    super('wrong-password', 'That is not your current password.')
  }
}
class SamePasswordError extends AccountError {
  constructor() {
    super('same', 'The new password must differ from the current one.')
  }
}

export async function changePassword(accountId: string, currentPassword: string, newPassword: string, { signal, delayMs = 700 }: RequestOptions = {}) {
  await simulateRequest(delayMs, signal, () => false)
  const problem = validatePassword(newPassword)
  updateAccounts((draft) => {
    const account = [...draft.staff, ...draft.admins, ...draft.superadmins].find((a) => a.id === accountId)
    if (!account) throw new NotFoundError()
    if (draft.passwords[accountId] !== currentPassword) throw new WrongPasswordError()
    if (problem) throw new ValidationError(problem)
    if (newPassword === currentPassword) throw new SamePasswordError()
    draft.passwords[accountId] = newPassword
    account.mustChangePassword = false
  })
}
