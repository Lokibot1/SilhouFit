import { useId, useState } from 'react'
import type { ProductVariant } from '../../../service/fetchProductList'
import { filterStock, parseStock, STOCK_ERROR, stepStock } from '../../../utils/stockEdit'
import { MinusIcon, PlusIcon } from '../../form/icons'
import { SECONDARY_BUTTON } from '../../ui/buttonStyles'

const STEPPER =
  'flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg hover:bg-line/60 hover:text-chrome-strong disabled:cursor-not-allowed disabled:opacity-40'
const INPUT = 'font-ui h-11 rounded-xl border border-line-strong bg-canvas px-2 text-right text-base text-fg tabular-nums aria-invalid:border-danger'

/** One variant's stock as a number box with - and + around it. `text` is what is typed; it is empty-checked here and range-checked by its five-digit cap. */
export function StockCell({
  variant,
  text,
  disabled,
  onChange,
}: {
  variant: Pick<ProductVariant, 'size' | 'color'>
  text: string
  disabled: boolean
  onChange: (text: string) => void
}) {
  const errorId = useId()
  const name = `${variant.color} ${variant.size}`
  const empty = parseStock(text) === null
  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center">
        <button
          type="button"
          aria-label={`Decrease stock for ${name}`}
          disabled={disabled || parseStock(text) === 0}
          onClick={() => onChange(stepStock(text, -1))}
          className={STEPPER}
        >
          <MinusIcon />
        </button>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          disabled={disabled}
          onChange={(event) => onChange(filterStock(event.target.value))}
          aria-label={`Stock for ${name}`}
          aria-invalid={empty}
          aria-describedby={empty ? errorId : undefined}
          className={`${INPUT} w-14`}
        />
        <button
          type="button"
          aria-label={`Increase stock for ${name}`}
          disabled={disabled || text === '99999'}
          onClick={() => onChange(stepStock(text, 1))}
          className={STEPPER}
        >
          <PlusIcon />
        </button>
      </div>
      {empty && (
        <p id={errorId} className="text-xs text-danger">
          {STOCK_ERROR}
        </p>
      )}
    </div>
  )
}

/** Sets every sold-out size to one number in a single step, for a restock that brings them all back. */
export function SoldOutHelper({ count, disabled, onApply }: { count: number; disabled: boolean; onApply: (stock: number) => void }) {
  const id = useId()
  const [text, setText] = useState('10')
  const stock = parseStock(text)
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1">
      <label htmlFor={id} className="text-sm text-fg">
        Set all sold-out sizes to
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        disabled={disabled}
        onChange={(event) => setText(filterStock(event.target.value))}
        className={`${INPUT} w-20`}
      />
      <button
        type="button"
        disabled={disabled || stock === null}
        onClick={() => stock !== null && onApply(stock)}
        aria-label={stock === null ? 'Set sold-out sizes' : `Set ${count} sold-out ${count === 1 ? 'size' : 'sizes'} to ${stock}`}
        className={`${SECONDARY_BUTTON} text-sm disabled:opacity-60`}
      >
        Apply
      </button>
    </div>
  )
}
