import { setLoginNotice } from './loginNotice'
import { signOut } from './signOut'

/** The API answered 401 `session_revoked` (an administrator reset this password): end the session here and let the sign-in page say why. */
export function endRevokedSession() {
  setLoginNotice('password-reset')
  signOut()
}

/** The API answered 403 `password_reset_expired` (the temporary password is older than 72 hours): end the session and let the sign-in page say why. */
export function endExpiredSession() {
  setLoginNotice('password-expired')
  signOut()
}

/** The API answered 401 `account_archived` (an administrator archived this account): end the session and let the sign-in page say why. */
export function endArchivedSession() {
  setLoginNotice('account-archived')
  signOut()
}
