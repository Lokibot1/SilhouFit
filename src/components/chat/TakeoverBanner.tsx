import { useState } from 'react'
import { ROLE_LABEL, type ChatHolder } from '../../service/chatApi'
import { ConfirmDialog } from '../admin/users/ConfirmDialog'
import { InfoIcon } from '../form/icons'
import { SECONDARY_BUTTON_SM } from '../ui/buttonStyles'

interface TakeoverBannerProps {
  holder: ChatHolder | null
  /** The viewer's own id, to tell "you" from someone else. */
  selfId?: string
  canSend: boolean
  canTakeOver: boolean
  canRelease: boolean
  /** A take over or release is in flight. */
  acting: boolean
  onTakeOver: () => Promise<void>
  onRelease: () => Promise<void>
}

/** Who handles the thread, for staff. Says so when the viewer can read but not reply, and offers Take over and Release to those allowed. */
export function TakeoverBanner({ holder, selfId, canSend, canTakeOver, canRelease, acting, onTakeOver, onRelease }: TakeoverBannerProps) {
  const [dialog, setDialog] = useState<'takeover' | 'release' | null>(null)
  if (!holder && !canTakeOver) return null

  const text = !holder
    ? 'Nobody is handling this conversation. Any staff member can reply.'
    : holder.id === selfId
      ? 'You are handling this conversation.'
      : `Handled by ${holder.name} (${ROLE_LABEL[holder.role]}).${canSend ? '' : ' You can read this conversation but not reply.'}`

  return (
    <div role="status" data-testid="takeover-banner" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-fg/5 px-3 py-2">
      <InfoIcon className="shrink-0 text-fg-muted" />
      <p className="font-ui min-w-0 flex-1 basis-56 text-sm text-fg">{text}</p>
      <div className="flex gap-2">
        {canTakeOver && (
          <button type="button" onClick={() => setDialog('takeover')} className={`${SECONDARY_BUTTON_SM} min-h-11!`}>
            Take over
          </button>
        )}
        {canRelease && (
          <button type="button" onClick={() => setDialog('release')} className={`${SECONDARY_BUTTON_SM} min-h-11!`}>
            Release
          </button>
        )}
      </div>
      <ConfirmDialog
        open={dialog === 'takeover'}
        title="Take over this conversation?"
        confirmLabel="Take over"
        pending={acting}
        onClose={() => setDialog(null)}
        onConfirm={() => void onTakeOver().then(() => setDialog(null))}
      >
        You will handle it from now on. Anyone whose role is not higher than yours can read it but no longer reply, until you release it.
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'release'}
        title="Release this conversation?"
        confirmLabel="Release conversation"
        pending={acting}
        onClose={() => setDialog(null)}
        onConfirm={() => void onRelease().then(() => setDialog(null))}
      >
        It goes back to the shared pool, where any staff member can reply again.
      </ConfirmDialog>
    </div>
  )
}
