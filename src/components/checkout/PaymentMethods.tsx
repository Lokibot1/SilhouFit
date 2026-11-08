import { useId, useState, type ReactNode } from 'react'
import gcashMark from '../../assets/gcash-mark.svg'
import mayaLogo from '../../assets/maya-logo.svg'
import type { Payment, Provider } from '../../utils/checkout'
import { ChevronRightIcon, InfoIcon, WalletIcon } from '../form/icons'
import { KRAL_PRIMARY } from '../shop/shopControls'
import { Modal } from '../ui/Modal'
import { Tooltip } from '../ui/Tooltip'

interface Method {
  id: 'gcash' | 'maya' | 'cash'
  payment: Payment
  provider: Provider
  name: string
  /** Shown under the name in the full list, and read out as the radio's description. */
  description: string
  /** A short hint on hover, beside the name. */
  info?: string
  tile: ReactNode
  /** The tile's background: the brand logos each need their own ground in both themes. */
  tileBg: string
}

// GCash's logo is blue on white, Maya's is light green and reads on a dark ground; both stay as they are in either theme.
const gcashTile = (name: string) => <img src={gcashMark} alt={name} className="size-[70%] object-contain" />
const mayaTile = (name: string) => <img src={mayaLogo} alt={name} className="w-[80%] object-contain" />
const COD_TILE = <span className="font-kral-mono text-xs font-medium">COD</span>

// The methods the checkout supports: GCash and Maya under E-Wallet, and cash on delivery.
const METHODS: Method[] = [
  { id: 'gcash', payment: 'ewallet', provider: 'gcash', name: 'GCash', description: 'E-wallet', tile: gcashTile('GCash'), tileBg: 'bg-white' },
  { id: 'maya', payment: 'ewallet', provider: 'maya', name: 'Maya', description: 'E-wallet', tile: mayaTile('Maya'), tileBg: 'bg-kral-obsidian' },
  { id: 'cash', payment: 'cash', provider: 'gcash', name: 'Cash on delivery', description: 'Pay the rider when it arrives.', info: 'Pay the rider when it arrives.', tile: COD_TILE, tileBg: 'bg-kral-porcelain dark:bg-kral-graphite' },
]
/** Shown inline; whichever other method is chosen takes the last inline slot. */
const TOP: Method['id'][] = ['gcash', 'cash']

const idOf = (payment: Payment, provider: Provider): Method['id'] => (payment === 'cash' ? 'cash' : provider)

const TILE =
  'flex size-10 shrink-0 items-center justify-center border border-kral-rule text-kral-fg'
const LINK =
  'kral-focus font-kral-mono flex min-h-11 cursor-pointer items-center gap-1 text-base font-medium text-kral-fg uppercase hover:text-kral-red-ink md:text-xs md:tracking-[0.08em]'

function Row({ method, name, checked, onSelect, detail }: { method: Method; name: string; checked: boolean; onSelect: () => void; detail?: boolean }) {
  const noteId = useId()
  return (
    <label className="relative flex min-h-16 cursor-pointer items-center gap-3 py-2 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-kral-red-ink">
      <input
        type="radio"
        name={name}
        value={method.id}
        checked={checked}
        onChange={onSelect}
        aria-label={method.name}
        aria-describedby={noteId}
        className="peer sr-only"
      />
      <span className={`${TILE} ${method.tileBg}`}>
        {method.tile}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-kral-mono flex items-center gap-1 text-base font-medium text-kral-fg uppercase">
          <span className="min-w-0 [overflow-wrap:anywhere]">{method.name}</span>
          {method.info && (
            <Tooltip tone="kral" label={method.info}>
              <span aria-hidden="true" className="flex size-6 items-center justify-center text-kral-muted">
                <InfoIcon />
              </span>
            </Tooltip>
          )}
        </span>
        <span id={noteId} className={`font-kral-mono text-base text-kral-muted md:text-sm ${detail ? 'block' : 'sr-only'}`}>
          {method.description}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-kral-muted peer-checked:border-kral-red-ink peer-checked:*:bg-kral-red"
      >
        <span className="size-3 rounded-full" />
      </span>
    </label>
  )
}

interface PaymentMethodsProps {
  payment: Payment
  provider: Provider
  onChange: (payment: Payment, provider: Provider) => void
}

/** A compact, icon-led list: the top methods inline, every method in a sheet. Native radios, so arrow keys and labels work as for any radio group. */
export function PaymentMethods({ payment, provider, onChange }: PaymentMethodsProps) {
  const current = idOf(payment, provider)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(current)
  const inline = TOP.includes(current) ? TOP : [TOP[0], current]
  const rest = METHODS.filter((m) => !inline.includes(m.id))
  const pick = (method: Method) => onChange(method.payment, method.provider)

  return (
    <>
      <fieldset>
        <legend className="font-kral-display flex items-center gap-2 text-lg leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-xl">
          <WalletIcon />
          Payment method
        </legend>
        <div className="mt-2 divide-y divide-kral-rule">
          {inline.map((id) => {
            const method = METHODS.find((m) => m.id === id)!
            return <Row key={id} method={method} name="payment" checked={current === id} onSelect={() => pick(method)} />
          })}
        </div>
      </fieldset>
      <div className="flex min-h-14 items-center justify-between gap-3 border-t border-kral-rule">
        <div aria-hidden="true" className="flex gap-1">
          {rest.map((m) => (
            <span key={m.id} className={`${TILE} ${m.tileBg} size-8`}>
              {m.tile}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setDraft(current)
            setOpen(true)
          }}
          className={LINK}
        >
          View all options
          <ChevronRightIcon />
        </button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Payment method"
        icon={<WalletIcon />}
        variant="sheet"
        tone="kral"
        footer={
          <button
            type="button"
            onClick={() => {
              pick(METHODS.find((m) => m.id === draft)!)
              setOpen(false)
            }}
            className={`${KRAL_PRIMARY} w-full`}
          >
            Continue
          </button>
        }
      >
        <p className="font-kral-mono flex items-center gap-2 pb-2 text-base text-kral-muted md:text-sm">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
            <path d="M12 3 4 6v6c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V6l-8-3Z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          Your information is secure and encrypted
        </p>
        <fieldset className="pb-5">
          <legend className="sr-only">Payment method</legend>
          <div className="divide-y divide-kral-rule">
            {METHODS.map((m) => (
              <Row key={m.id} method={m} name="payment-all" checked={draft === m.id} onSelect={() => setDraft(m.id)} detail />
            ))}
          </div>
        </fieldset>
      </Modal>
    </>
  )
}
