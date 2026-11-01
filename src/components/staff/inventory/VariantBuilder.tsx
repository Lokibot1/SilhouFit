import { useState } from 'react'
import { withCommas } from '../../../utils/format'
import {
  DEFAULT_HEX,
  describedBy,
  newColor,
  filterColorName,
  filterPrice,
  filterSize,
  filterSku,
  filterStock,
  HEX_COLOR,
  PRODUCT_LIMITS,
  sizeChips,
  variantRows,
  type ColorRow,
  type ProductFormValues,
  type RowEdit,
} from '../../../utils/productValidation'
import { PlusIcon } from '../../form/icons'
import { SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { Field, FIELD_INPUT } from './FormField'
import { SizingPicker } from './SizingPicker'
import { StockCell } from './StockEditor'

/** The 6-digit form the native colour picker needs. */
export const pickerValue = (hex: string) =>
  HEX_COLOR.test(hex) ? (hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex.toLowerCase()) : DEFAULT_HEX

interface VariantBuilderProps {
  values: ProductFormValues
  /** The SKU of every row, by key. */
  skus: Record<string, string>
  disabled: boolean
  /** The error to show for a field key, or undefined while it is untouched or fine. */
  error: (key: string) => string | undefined
  touch: (key: string) => void
  set: (patch: Partial<ProductFormValues>) => void
}

const SMALL_BUTTON = `${SECONDARY_BUTTON} text-sm`

/** Sizes as tick chips plus custom sizes, colours as rows, and the size x colour variants they make, one card each (the sheet is narrow). */
export function VariantBuilder({ values, skus, disabled, error, touch, set }: VariantBuilderProps) {
  const [custom, setCustom] = useState('')
  const [customError, setCustomError] = useState<string>()
  const chips = sizeChips(values)
  const rows = variantRows(values)

  function toggle(size: string, on: boolean) {
    set({ sizes: on ? [...values.sizes, size] : values.sizes.filter((s) => s !== size) })
  }

  function addCustom() {
    if (!custom) return
    if (chips.includes(custom)) setCustomError(`${custom} is already in the list. Tick it above instead.`)
    else {
      setCustomError(undefined)
      set({ custom: [...values.custom, custom], sizes: [...values.sizes, custom] })
      setCustom('')
    }
  }

  const edit = (key: string, patch: RowEdit) => set({ edits: { ...values.edits, [key]: { ...values.edits[key], ...patch } } })
  const setColor = (id: string, patch: Partial<ColorRow>) => set({ colors: values.colors.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
  const sizesError = error('sizes')
  const colorsError = error('colors')

  return (
    <div className="grid gap-5">
      <SizingPicker values={values} disabled={disabled} error={error} touch={touch} set={set} />

      {values.sizingMode === 'base' && (
        <fieldset className="grid gap-2" aria-describedby={describedBy('pf-sizes', sizesError)}>
          <legend className="text-sm font-semibold text-fg">Sizes</legend>
          <div id="pf-sizes" tabIndex={-1} className="flex flex-wrap gap-2 outline-none">
            {chips.map((size) => (
              <label key={size} className="relative cursor-pointer">
                <input
                  type="checkbox"
                  checked={values.sizes.includes(size)}
                  disabled={disabled}
                  onChange={(event) => toggle(size, event.target.checked)}
                  onBlur={() => touch('sizes')}
                  className="peer sr-only"
                />
                <span className="font-ui flex min-h-11 min-w-11 items-center justify-center rounded-xl border-2 border-line-strong px-3 text-base font-semibold text-fg peer-checked:border-fg peer-checked:bg-fg peer-checked:text-canvas peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-chrome-strong peer-disabled:opacity-60">
                  {size}
                </span>
              </label>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Field id="pf-custom-size" label="Add a size" optional error={customError}>
                <input
                  id="pf-custom-size"
                  type="text"
                  autoComplete="off"
                  maxLength={PRODUCT_LIMITS.sizeMax}
                  value={custom}
                  disabled={disabled}
                  placeholder="e.g. 2XL"
                  aria-invalid={Boolean(customError)}
                  aria-describedby={describedBy('pf-custom-size', customError)}
                  onChange={(event) => {
                    setCustomError(undefined)
                    setCustom(filterSize(event.target.value))
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    addCustom()
                  }}
                  className={FIELD_INPUT}
                />
              </Field>
            </div>
            <button type="button" disabled={disabled || !custom} onClick={addCustom} className={SMALL_BUTTON}>
              Add size
            </button>
          </div>
          {sizesError && <p className="text-sm text-danger">{sizesError}</p>}
        </fieldset>
      )}

      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold text-fg">
          Colours <span className="font-normal text-fg-muted tabular-nums">({values.colors.length}/{PRODUCT_LIMITS.colorsMax})</span>
        </legend>
        {values.colors.map((color, index) => {
          const nameId = `pf-color-name-${color.id}`
          const hexId = `pf-color-hex-${color.id}`
          const nameError = error(`color-name:${color.id}`)
          const hexError = error(`color-hex:${color.id}`)
          return (
            <div key={color.id} className="grid gap-2 rounded-xl border border-line p-3">
              <Field id={nameId} label={`Colour ${index + 1} name`} error={nameError}>
                <input
                  id={nameId}
                  type="text"
                  autoComplete="off"
                  value={color.name}
                  disabled={disabled}
                  placeholder="e.g. Navy"
                  aria-invalid={Boolean(nameError)}
                  aria-describedby={describedBy(nameId, nameError)}
                  onChange={(event) => setColor(color.id, { name: filterColorName(event.target.value) })}
                  onBlur={() => touch(`color-name:${color.id}`)}
                  className={FIELD_INPUT}
                />
              </Field>
              <div className="flex items-end gap-2">
                <input
                  type="color"
                  value={pickerValue(color.hex)}
                  disabled={disabled}
                  aria-label={`Pick colour ${index + 1}`}
                  onChange={(event) => setColor(color.id, { hex: event.target.value })}
                  className="size-11 shrink-0 cursor-pointer rounded-xl border border-line-strong bg-canvas p-1 disabled:opacity-60"
                />
                <div className="min-w-0 flex-1">
                  <Field id={hexId} label={`Colour ${index + 1} hex`} error={hexError}>
                    <input
                      id={hexId}
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={7}
                      value={color.hex}
                      disabled={disabled}
                      aria-invalid={Boolean(hexError)}
                      aria-describedby={describedBy(hexId, hexError)}
                      onChange={(event) => setColor(color.id, { hex: `#${event.target.value.replace(/[^0-9a-f]/gi, '').slice(0, 6)}` })}
                      onBlur={() => touch(`color-hex:${color.id}`)}
                      className={`${FIELD_INPUT} tabular-nums`}
                    />
                  </Field>
                </div>
                <button
                  type="button"
                  disabled={disabled || values.colors.length === 1}
                  aria-label={`Remove colour ${index + 1}`}
                  onClick={() => set({ colors: values.colors.filter((c) => c.id !== color.id) })}
                  className={SMALL_BUTTON}
                >
                  Remove
                </button>
              </div>
            </div>
          )
        })}
        <div>
          <button
            type="button"
            id="pf-colors"
            disabled={disabled || values.colors.length >= PRODUCT_LIMITS.colorsMax}
            onClick={() => set({ colors: [...values.colors, newColor()] })}
            className={SMALL_BUTTON}
          >
            <PlusIcon className="mr-2" />
            Add colour
          </button>
        </div>
        {colorsError && <p className="text-sm text-danger">{colorsError}</p>}
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold text-fg">
          Variants <span className="font-normal text-fg-muted tabular-nums">({rows.length})</span>
        </legend>
        {error('matrix') && (
          <p id="pf-matrix" tabIndex={-1} className="text-sm text-danger outline-none">
            {error('matrix')}
          </p>
        )}
        {rows.length === 0 && <p className="text-xs text-fg-muted">Tick a size and name a colour to list the variants to stock.</p>}
        {rows.map(({ key, size, color, hex }) => {
          const label = `${color} ${size}`
          const skuId = `pf-sku-${key}`
          const priceId = `pf-price-${key}`
          const skuError = error(`sku:${key}`)
          const priceError = error(`price:${key}`)
          return (
            <div key={key} className="grid gap-2 rounded-xl border border-line p-3">
              <p className="flex items-center gap-2 text-base font-semibold text-fg">
                <span aria-hidden="true" style={{ backgroundColor: pickerValue(hex) }} className="size-4 shrink-0 rounded-full border border-line-strong" />
                {color} · {size}
              </p>
              <Field id={skuId} label="SKU" error={skuError}>
                <input
                  id={skuId}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={skus[key] ?? ''}
                  disabled={disabled}
                  aria-label={`SKU for ${label}`}
                  aria-invalid={Boolean(skuError)}
                  aria-describedby={describedBy(skuId, skuError)}
                  onChange={(event) => edit(key, { sku: filterSku(event.target.value) })}
                  onBlur={() => {
                    touch(`sku:${key}`)
                    // A SKU left empty goes back to the generated one.
                    if (values.edits[key]?.sku === '') edit(key, { sku: undefined })
                  }}
                  className={`${FIELD_INPUT} tabular-nums`}
                />
              </Field>
              <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                <div id={`pf-stock-${key}`} tabIndex={-1} className="grid gap-1 outline-none">
                  <span className="text-sm font-semibold text-fg">Stock</span>
                  <StockCell
                    variant={{ color, size, name: null, sku: '' }}
                    text={values.edits[key]?.stock ?? '0'}
                    disabled={disabled}
                    onChange={(text) => edit(key, { stock: filterStock(text) })}
                  />
                </div>
                <div className="min-w-32 flex-1">
                  <Field id={priceId} label="Price override" optional error={priceError}>
                    <input
                      id={priceId}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={withCommas(values.edits[key]?.price ?? '')}
                      disabled={disabled}
                      placeholder="Base price"
                      aria-label={`Price override for ${label}`}
                      aria-invalid={Boolean(priceError)}
                      aria-describedby={describedBy(priceId, priceError)}
                      onChange={(event) => edit(key, { price: filterPrice(event.target.value) })}
                      onBlur={() => touch(`price:${key}`)}
                      className={`${FIELD_INPUT} text-right tabular-nums`}
                    />
                  </Field>
                </div>
              </div>
            </div>
          )
        })}
      </fieldset>
    </div>
  )
}
