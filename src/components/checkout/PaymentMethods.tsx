import { useId } from 'react'
import gcashMark from '../../assets/gcash-mark.svg'
import mayaLogo from '../../assets/maya-logo.svg'
import { InfoIcon, WalletIcon } from '../form/icons'
import { Tooltip } from '../ui/Tooltip'

const TILE = 'flex shrink-0 items-center justify-center border border-kral-rule text-kral-fg'
const TEXT_TILE = `${TILE} font-kral-mono h-8 px-2 text-base font-medium md:text-xs`
const UNAVAILABLE = 'Unavailable for now'

// The hosted payment page offers these; the customer picks there. GCash's logo is blue on white and Maya's reads on a dark ground, so each keeps its own ground in both themes.
const OTHER_METHODS = ['Card', 'GrabPay', 'Online banking', 'BillEase']

const ROW =
  'relative flex min-h-16 items-center gap-3 py-2 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-kral-red-ink'
const NAME = 'font-kral-mono flex items-center gap-1 text-base font-medium text-kral-fg uppercase'
const NOTE = 'font-kral-mono block text-base text-kral-muted md:text-sm'
const RADIO_DOT =
  'flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-kral-muted peer-checked:border-kral-red-ink peer-checked:*:bg-kral-red'

/** Online payment is the only real choice: the customer picks GCash, Maya, a card and the rest on the provider's page. Cash on delivery is shown but off. Native radios, so labels and arrow keys work as for any radio group. */
export function PaymentMethods() {
  const onlineNote = useId()
  const cashNote = useId()

  return (
    <fieldset>
      <legend className="font-kral-display flex items-center gap-2 text-lg leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-xl">
        <WalletIcon />
        Payment method
      </legend>
      <div className="mt-2 divide-y divide-kral-rule">
        <label className={`${ROW} cursor-pointer`}>
          <input
            type="radio"
            name="payment"
            value="online"
            defaultChecked
            aria-label="Pay online"
            aria-describedby={onlineNote}
            className="peer sr-only"
          />
          <span className={`${TILE} size-10`}>
            <WalletIcon />
          </span>
          <span className="min-w-0 flex-1">
            <span className={NAME}>Pay online</span>
            <span id={onlineNote} className={NOTE}>
              Choose GCash, Maya, card, GrabPay, online banking or BillEase on the secure payment page after you place your order.
            </span>
            <span className="mt-2 flex flex-wrap gap-1" aria-hidden="true">
              <span className={`${TILE} h-8 w-8 bg-white`}>
                <img src={gcashMark} alt="GCash" className="size-[70%] object-contain" />
              </span>
              <span className={`${TILE} h-8 w-12 bg-kral-obsidian`}>
                <img src={mayaLogo} alt="Maya" className="w-[80%] object-contain" />
              </span>
              {OTHER_METHODS.map((name) => (
                <span key={name} className={`${TEXT_TILE} bg-kral-porcelain dark:bg-kral-graphite`}>
                  {name}
                </span>
              ))}
            </span>
          </span>
          <span aria-hidden="true" className={RADIO_DOT}>
            <span className="size-3 rounded-full" />
          </span>
        </label>

        <Tooltip tone="kral" label={UNAVAILABLE} className="w-full">
          <label className={`${ROW} w-full cursor-not-allowed opacity-60`}>
            <input
              type="radio"
              name="payment"
              value="cash"
              disabled
              aria-label="Cash on delivery"
              aria-describedby={cashNote}
              className="peer sr-only"
            />
            <span className={`${TILE} size-10 bg-kral-porcelain dark:bg-kral-graphite`}>
              <span className="font-kral-mono text-xs font-medium">COD</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className={NAME}>
                <span className="min-w-0 [overflow-wrap:anywhere]">Cash on delivery</span>
                <button
                  type="button"
                  aria-label="About Cash on delivery"
                  aria-describedby={cashNote}
                  className="kral-focus relative flex size-6 items-center justify-center text-kral-muted after:absolute after:-inset-2.5 after:content-['']"
                >
                  <InfoIcon />
                </button>
              </span>
              <span id={cashNote} className={NOTE}>
                {UNAVAILABLE}
              </span>
            </span>
            <span aria-hidden="true" className={RADIO_DOT}>
              <span className="size-3 rounded-full" />
            </span>
          </label>
        </Tooltip>
      </div>
    </fieldset>
  )
}
