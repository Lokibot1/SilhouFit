import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { passwordGateSkipKey } from '../../config/accountPolicy'
import type { Me } from '../../service/fetchMe'
import { LockIcon } from '../form/icons'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../ui/buttonStyles'
import { Modal } from '../ui/Modal'

function wasDismissed(id: string) {
  try {
    return sessionStorage.getItem(passwordGateSkipKey(id)) === '1'
  } catch {
    return false
  }
}

/**
 * Tells a staff member still on the temporary password (or an admin whose password was reset) to choose their own, over whatever page they opened. The change itself is made in
 * the profile's Change password sheet. Dismissing hides this for the browser session only (sign-out clears it), so it returns at the next sign-in.
 * An admin sees it only after a reset; a new admin's first-login change is not prompted here.
 * After an administrator reset the password it cannot be dismissed: the only ways out are changing the password or signing out.
 */
export function FirstLoginPasswordGate({ me, sheetOpen, onSignOut }: { me: Me; sheetOpen: boolean; onSignOut: () => void }) {
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(() => wasDismissed(me.id))
  // The gate steps aside only while the Change password sheet is open (two stacked modals would fight over focus).
  const reset = Boolean(me.passwordResetRequired)
  const staff = me.role === 'staff'

  function dismiss() {
    try {
      sessionStorage.setItem(passwordGateSkipKey(me.id), '1')
    } catch {
      // Storage is blocked: the notice stays hidden for this page load only.
    }
    setDismissed(true)
  }

  function changePassword() {
    if (!reset) dismiss()
    navigate(`/${me.role}/profile`, { state: { openChangePassword: true } })
  }

  return (
    <Modal
      open={!sheetOpen && ((reset && (staff || me.role === 'admin')) || (staff && Boolean(me.mustChangePassword) && !dismissed))}
      onClose={reset ? () => {} : dismiss}
      closable={!reset}
      title={reset ? 'Choose a new password' : 'Change your temporary password'}
      icon={<LockIcon />}
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {reset ? (
            <button type="button" onClick={onSignOut} className={SECONDARY_BUTTON}>
              Sign out
            </button>
          ) : (
            <button type="button" onClick={dismiss} className={SECONDARY_BUTTON}>
              Remind me later
            </button>
          )}
          <button type="button" onClick={changePassword} className={PRIMARY_BUTTON}>
            <LockIcon size={16} />
            Change password
          </button>
        </div>
      }
    >
      <p className="pb-5 text-base leading-relaxed text-fg-muted">
        {reset
          ? 'An administrator reset your password to the default. Choose your own now before you continue.'
          : 'You signed in with a temporary password that was shared with you. Choose your own now so only you know it.'}
      </p>
    </Modal>
  )
}
