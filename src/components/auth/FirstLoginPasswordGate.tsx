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
 * Tells a staff member still on the temporary password to choose their own, over whatever page they opened. The change itself is made in
 * the profile's Change password sheet. Dismissing hides this for the browser session only (sign-out clears it), so it returns at the next sign-in.
 */
export function FirstLoginPasswordGate({ me }: { me: Me }) {
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(() => wasDismissed(me.id))

  function dismiss() {
    try {
      sessionStorage.setItem(passwordGateSkipKey(me.id), '1')
    } catch {
      // Storage is blocked: the notice stays hidden for this page load only.
    }
    setDismissed(true)
  }

  function changePassword() {
    dismiss()
    navigate('/staff/profile', { state: { openChangePassword: true } })
  }

  return (
    <Modal
      open={me.role === 'staff' && Boolean(me.mustChangePassword) && !dismissed}
      onClose={dismiss}
      title="Change your temporary password"
      icon={<LockIcon />}
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={dismiss} className={SECONDARY_BUTTON}>
            Remind me later
          </button>
          <button type="button" onClick={changePassword} className={PRIMARY_BUTTON}>
            <LockIcon size={16} />
            Change password
          </button>
        </div>
      }
    >
      <p className="pb-5 text-base leading-relaxed text-fg-muted">
        You signed in with a temporary password that was shared with you. Choose your own now so only you know it.
      </p>
    </Modal>
  )
}
