import { useEffect, useRef, useState } from 'react'
import { useCurrentUser } from '../../../hooks/useCurrentUser'
import { blockMessagingApi, unblockMessagingApi } from '../../../service/staffApi'
import type { CustomerAccount } from '../../../types/accounts'
import { fullName } from '../../../utils/accountQuery'
import { formatPlacedAt } from '../../../utils/format'
import { AlertIcon, RestoreIcon, XIcon } from '../../form/icons'
import { Field, FIELD_INPUT } from '../../staff/inventory/FormField'
import { useToast } from '../../toast/useToast'
import { DANGER_BUTTON_SM, SECONDARY_BUTTON_SM, UPDATE_BUTTON_SM } from '../../ui/buttonStyles'
import { Modal } from '../../ui/Modal'
import { ConfirmDialog } from './ConfirmDialog'
import { CustomerOffenses } from './CustomerOffenses'
import { CustomerPurchases } from './CustomerPurchases'
import { StatusBadge } from './StatusBadge'

const REASON_MAX = 500

const REASON_PRESETS = ['Offensive or abusive language', 'Harassment of staff', 'Spam or repeated messages', 'Inappropriate images']

type Action = 'block' | 'unblock'

const ACTIONS: Record<Action, { confirmLabel: string; button: string; effect: string; done: string }> = {
  block: {
    confirmLabel: 'Block Messaging',
    button: 'Block messaging',
    effect: "can still browse and shop, but can't send chat messages until messaging is unblocked. Their earlier messages stay in the conversations.",
    done: 'messaging blocked.',
  },
  unblock: {
    confirmLabel: 'Unblock Messaging',
    button: 'Unblock messaging',
    effect: 'will be able to send chat messages again.',
    done: 'messaging unblocked.',
  },
}

/** What happened, why, and what to do, for a block or unblock that failed. The server's own sentence is shown for a refusal. */
function failureCopy(error: unknown, name: string, action: Action) {
  const { status, detail } = (error ?? {}) as { status?: number; detail?: string }
  const head = `Couldn't ${action} messaging for ${name}.`
  if (status === 401) return `${head} Your session expired. Sign in again, then retry.`
  if (status === 403) return `${head} ${detail ?? 'Your account is not allowed to do this.'} Nothing changed.`
  if (status === 404) return `${head} This customer account no longer exists. Close this panel and reload the list.`
  if (status === 409) return `${head} ${detail ?? 'Its status already changed.'} Close this panel and reload the list to see the current status.`
  if (status === 429) return `${head} Too many requests were sent, so nothing changed. Wait a few minutes, then try again.`
  return `${head} The change wasn't saved, probably because the connection dropped. Press ${ACTIONS[action].confirmLabel} to try again.`
}

interface CustomerDetailsSheetProps {
  /** The customer to show; null keeps the sheet closed. */
  account: CustomerAccount | null
  onClose: () => void
  /** Called with the customer as the server returns it after messaging is blocked or unblocked. */
  onChanged: (account: CustomerAccount) => void
}

/** A customer's additional data: account basics, purchases, offenses and the messaging block. An admin or a superadmin can block and unblock messaging; only a superadmin reads the offenses. */
export function CustomerDetailsSheet({ account, onClose, onChanged }: CustomerDetailsSheetProps) {
  const toast = useToast()
  const role = useCurrentUser()?.role
  const manage = role === 'admin' || role === 'superadmin'
  const [confirming, setConfirming] = useState<Action | null>(null)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const wasConfirming = useRef(false)
  const name = account ? fullName(account) : ''
  const blocked = !!account?.messagingBlockedAt
  const action: Action = blocked ? 'unblock' : 'block'

  // The dialog swaps with the sheet, which reopens with focus on its panel: put it back on the button that asked.
  useEffect(() => {
    if (confirming) wasConfirming.current = true
    else if (wasConfirming.current) {
      wasConfirming.current = false
      trigger.current?.focus()
    }
  }, [confirming])

  async function confirm() {
    if (!account || !confirming || pending) return
    const { done } = ACTIONS[confirming]
    setPending(true)
    try {
      const updated = await (confirming === 'block' ? blockMessagingApi(account.id, reason) : unblockMessagingApi(account.id))
      onChanged(updated)
      toast.show({ kind: 'success', message: `${name}: ${done}` })
      setConfirming(null)
      setReason('')
    } catch (error) {
      toast.show({ kind: 'error', message: failureCopy(error, name, confirming) })
      setConfirming(null)
    } finally {
      setPending(false)
    }
  }

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

            <CustomerPurchases id={account.id} />

            <CustomerOffenses id={account.id} total={account.offenseCount} canRead={role === 'superadmin'} />

            <section aria-labelledby="moderation-heading" className="grid gap-3">
              <h3 id="moderation-heading" className="text-base font-semibold text-fg">
                Messaging
              </h3>
              <p className="flex items-center gap-2 text-base text-fg">
                <span className="text-fg-muted">Status:</span>
                <span className="font-ui inline-flex h-6 items-center gap-1.5 rounded-full border border-line-strong px-2 text-sm whitespace-nowrap">
                  <span aria-hidden="true" className={`size-2 rounded-full ${blocked ? 'bg-warning' : 'bg-success'}`} />
                  {blocked ? 'Messaging blocked' : 'Messaging allowed'}
                </span>
              </p>
              {account.messagingBlockedAt && (
                <p className="text-sm break-words text-fg-muted tabular-nums">
                  Blocked <time dateTime={account.messagingBlockedAt}>{formatPlacedAt(account.messagingBlockedAt)}</time>.{account.messagingBlockedReason && ` Reason: ${account.messagingBlockedReason}`}
                </p>
              )}
              {manage && (
                <div className="flex flex-wrap gap-3">
                  <button ref={trigger} type="button" onClick={() => setConfirming(action)} className={action === 'block' ? DANGER_BUTTON_SM : UPDATE_BUTTON_SM}>
                    {action === 'block' ? <AlertIcon /> : <RestoreIcon />}
                    {ACTIONS[action].button}
                  </button>
                </div>
              )}
            </section>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={!!account && !!confirming}
        title={confirming ? `${ACTIONS[confirming].button} for ${name}?` : ''}
        confirmLabel={confirming ? ACTIONS[confirming].confirmLabel : ''}
        icon={confirming === 'unblock' ? <RestoreIcon /> : <XIcon />}
        intent={confirming === 'unblock' ? 'update' : undefined}
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
        {confirming === 'block' && (
          <div className="mt-3">
            <div role="group" aria-label="Common reasons" className="mb-3 flex flex-wrap gap-2">
              {REASON_PRESETS.map((preset) => (
                <button key={preset} type="button" aria-pressed={reason === preset} onClick={() => setReason(preset)} className={`${SECONDARY_BUTTON_SM} aria-pressed:ring-2 aria-pressed:ring-fg`}>
                  {preset}
                </button>
              ))}
            </div>
            <Field id="moderation-reason" label="Reason" optional count={{ value: reason.length, max: REASON_MAX }}>
              <textarea id="moderation-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={REASON_MAX} rows={2} className={FIELD_INPUT} />
            </Field>
          </div>
        )}
      </ConfirmDialog>
    </>
  )
}
