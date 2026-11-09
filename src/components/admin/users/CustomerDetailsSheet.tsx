import { useState } from 'react'
import { useCurrentUser } from '../../../hooks/useCurrentUser'
import { useModeration } from '../../../hooks/useModeration'
import { banUser, blockMessaging, unbanUser, unblockMessaging, type ModerationAction, type ModerationStatus } from '../../../service/moderation'
import type { CustomerAccount } from '../../../types/accounts'
import { fullName } from '../../../utils/accountQuery'
import { formatPlacedAt } from '../../../utils/format'
import { Field, FIELD_INPUT } from '../../staff/inventory/FormField'
import { useToast } from '../../toast/useToast'
import { SECONDARY_BUTTON_SM } from '../../ui/buttonStyles'
import { Modal } from '../../ui/Modal'
import { ConfirmDialog } from './ConfirmDialog'
import { StatusBadge } from './StatusBadge'

const REASON_MAX = 200

const STATUS_LABEL: Record<ModerationStatus, { label: string; dot: string }> = {
  active: { label: 'Active', dot: 'bg-success' },
  messaging_blocked: { label: 'Messaging blocked', dot: 'bg-warning' },
  banned: { label: 'Banned', dot: 'bg-danger' },
}

const ACTIONS: Record<ModerationAction, { run: typeof blockMessaging; confirmLabel: string; button: string; effect: string; done: string; past: string }> = {
  block_messaging: {
    run: blockMessaging,
    confirmLabel: 'Block Messaging',
    button: 'Block messaging',
    effect: "can still browse and shop, but can't send chat messages until messaging is unblocked. Their earlier messages stay in the conversations.",
    done: 'messaging blocked.',
    past: 'Messaging blocked',
  },
  unblock_messaging: {
    run: unblockMessaging,
    confirmLabel: 'Unblock Messaging',
    button: 'Unblock messaging',
    effect: 'will be able to send chat messages again.',
    done: 'messaging unblocked.',
    past: 'Messaging unblocked',
  },
  ban: {
    run: banUser,
    confirmLabel: 'Ban Account',
    button: 'Ban account',
    effect: "can't sign in, and any open session ends. Their orders and messages are kept, and you can unban them from here.",
    done: 'banned.',
    past: 'Banned',
  },
  unban: {
    run: unbanUser,
    confirmLabel: 'Unban Account',
    button: 'Unban account',
    effect: 'will be able to sign in again.',
    done: 'unbanned.',
    past: 'Unbanned',
  },
}

/** The actions a status allows. A banned customer is only ever unbanned. */
const ALLOWED: Record<ModerationStatus, ModerationAction[]> = {
  active: ['block_messaging', 'ban'],
  messaging_blocked: ['unblock_messaging', 'ban'],
  banned: ['unban'],
}

interface CustomerDetailsSheetProps {
  /** The customer to show; null keeps the sheet closed. */
  account: CustomerAccount | null
  onClose: () => void
}

/** A customer's additional data: account basics, chat offenses, moderation status, the actions staff can take and who took them. */
export function CustomerDetailsSheet({ account, onClose }: CustomerDetailsSheetProps) {
  const toast = useToast()
  const actor = useCurrentUser()?.name ?? 'Staff'
  const [confirming, setConfirming] = useState<ModerationAction | null>(null)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const moderation = useModeration(account?.id ?? '')
  const name = account ? fullName(account) : ''

  async function confirm() {
    if (!account || !confirming || pending) return
    const { run, done, confirmLabel } = ACTIONS[confirming]
    setPending(true)
    try {
      await run(account.id, actor, reason)
      toast.show({ kind: 'success', message: `${name}: ${done}` })
      setConfirming(null)
      setReason('')
    } catch {
      toast.show({ kind: 'error', message: `Couldn't update ${name}. The change wasn't saved, probably because the connection dropped. Press ${confirmLabel} to try again.` })
    } finally {
      setPending(false)
    }
  }

  const { label, dot } = STATUS_LABEL[moderation.status]
  const total = moderation.offenses.length

  // The confirmation replaces the sheet instead of stacking on it, so only one dialog traps focus and answers Escape.
  return (
    <>
      <Modal open={!!account && !confirming} onClose={onClose} title={name || 'Customer'} variant="sheet">
        {account && (
          <div className="grid gap-6 pb-5">
            <dl className="grid gap-1 text-base">
              <div className="flex gap-2">
                <dt className="text-fg-muted">Email:</dt>
                <dd className="min-w-0 break-words text-fg">{account.email}</dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="text-fg-muted">Account:</dt>
                <dd>
                  <StatusBadge status={account.status} />
                </dd>
              </div>
            </dl>

            <section aria-labelledby="offenses-heading" className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <h3 id="offenses-heading" className="text-base font-semibold text-fg">
                  Offenses
                </h3>
                <p className="font-ui text-base text-fg tabular-nums">
                  <span className="sr-only">Total offenses: </span>
                  {total}
                </p>
              </div>
              <p className="flex items-center gap-2 text-base text-fg">
                <span className="text-fg-muted">Moderation status:</span>
                <span className="font-ui inline-flex h-6 items-center gap-1.5 rounded-full border border-line-strong px-2 text-sm whitespace-nowrap">
                  <span aria-hidden="true" className={`size-2 rounded-full ${dot}`} />
                  {label}
                </span>
              </p>
              {total === 0 ? (
                <p className="text-base text-fg-muted">No offenses. Chat messages with hidden words from this customer will be listed here.</p>
              ) : (
                <ol aria-label="Offenses, newest first" className="divide-y divide-line border-y border-line">
                  {moderation.offenses.map((offense) => (
                    <li key={offense.id} className="grid gap-0.5 py-2 text-left">
                      <p className="text-sm text-fg-muted tabular-nums">
                        <time dateTime={offense.createdAt}>{formatPlacedAt(offense.createdAt)}</time>
                        {offense.conversationId && <span className="font-mono"> · {offense.conversationId}</span>}
                      </p>
                      <p className="text-base break-words text-fg">{offense.excerpt}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section aria-labelledby="moderation-heading" className="grid gap-3">
              <h3 id="moderation-heading" className="text-base font-semibold text-fg">
                Moderation
              </h3>
              <div className="flex flex-wrap gap-3">
                {ALLOWED[moderation.status].map((action) => (
                  <button key={action} type="button" onClick={() => setConfirming(action)} className={SECONDARY_BUTTON_SM}>
                    {ACTIONS[action].button}
                  </button>
                ))}
              </div>
              {moderation.history.length === 0 ? (
                <p className="text-base text-fg-muted">No moderation actions yet.</p>
              ) : (
                <ol aria-label="Moderation actions, newest first" className="divide-y divide-line border-y border-line">
                  {moderation.history.map((entry) => (
                    <li key={entry.id} className="grid gap-0.5 py-2 text-left">
                      <p className="text-base text-fg">
                        {ACTIONS[entry.action].past} by {entry.actor}
                      </p>
                      <p className="text-sm text-fg-muted tabular-nums">
                        <time dateTime={entry.at}>{formatPlacedAt(entry.at)}</time>
                      </p>
                      {entry.reason && <p className="text-base break-words text-fg-muted">Reason: {entry.reason}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={!!account && !!confirming}
        title={confirming ? `${ACTIONS[confirming].button} for ${name}?` : ''}
        confirmLabel={confirming ? ACTIONS[confirming].confirmLabel : ''}
        pending={pending}
        onConfirm={() => void confirm()}
        onClose={() => {
          setConfirming(null)
          setReason('')
        }}
      >
        <p>
          {name} {confirming && ACTIONS[confirming].effect}
        </p>
        <div className="mt-3">
          <Field id="moderation-reason" label="Reason" optional count={{ value: reason.length, max: REASON_MAX }}>
            <textarea id="moderation-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={REASON_MAX} rows={2} className={FIELD_INPUT} />
          </Field>
        </div>
      </ConfirmDialog>
    </>
  )
}
