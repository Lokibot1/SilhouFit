import { useEffect, useRef, useState, type FormEvent } from 'react'
import { withCommas } from '../../../utils/format'
import type { ProductVariant } from '../../../service/fetchProductList'
import { createFailureReason, createVariant, manageFailureReason, saveVariant, uploadImage } from '../../../service/inventoryActions'
import {
  buildVariantInput,
  buildVariantPatch,
  checkImageFile,
  describedBy,
  filterColorName,
  filterMeasurement,
  filterPrice,
  filterSize,
  filterSku,
  filterStock,
  filterText,
  IMAGE_TYPES,
  MEASUREMENT_FIELDS,
  PRODUCT_LIMITS,
  validateVariantForm,
  variantFormValues,
  type VariantFormValues,
} from '../../../utils/productValidation'
import { AlertIcon, PlusIcon, SpinnerIcon } from '../../form/icons'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { Modal } from '../../ui/Modal'
import { COLUMNS_BY_CATEGORY } from '../../../utils/sizeMeasurementValidation'
import { Field, FIELD_INPUT } from './FormField'
import { pickerValue } from './VariantBuilder'

const FORM_ID = 'variant-form'
const RETRYABLE = ['network', 'rate-limit', 'server']
const SMALL_BUTTON = `${SECONDARY_BUTTON} text-sm`
/** The field each error key belongs to, to move focus to the first problem. */
const FIELD_ID: Record<string, string> = { identity: 'vs-size', colorHex: 'vs-hex', sku: 'vs-sku', price: 'vs-price', stock: 'vs-stock' }

interface Banner {
  title: string
  why: string
  retry: boolean
}

interface VariantSheetProps {
  mode: 'add' | 'edit'
  productId: string
  /** The product's category, which decides the measurements asked for. Left out, all nine are. */
  category?: string
  /** The variant being edited. */
  variant?: ProductVariant
  /** The variant was saved. The page closes the sheet, refreshes and shows the toast. */
  onSaved: () => void
  onClose: () => void
}

/** Add a variant to a product, or edit one: size, colour, name, SKU, price, an optional image and the garment measurements AR Fitting uses. Mount it fresh for each variant. */
export function VariantSheet({ mode, productId, category, variant, onSaved, onClose }: VariantSheetProps) {
  const editing = mode === 'edit' && variant !== undefined
  const [values, setValues] = useState(() => variantFormValues(variant))
  // Only the measurements that make sense for the category (no sleeve on pants). One the variant already has stays, so it can still be changed or
  // cleared; it is decided once, so a box does not vanish as it is emptied.
  const columns = category ? COLUMNS_BY_CATEGORY[category] : undefined
  const [fields] = useState(() => (columns ? MEASUREMENT_FIELDS.filter(({ key }) => columns.includes(key) || variantFormValues(variant).measurements[key]) : MEASUREMENT_FIELDS))
  const [image, setImage] = useState<{ file: File; preview: string } | null>(null)
  const [imageNote, setImageNote] = useState<string>()
  const [progress, setProgress] = useState<number>()
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set())
  const [attempted, setAttempted] = useState(false)
  const [pending, setPending] = useState(false)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [conflictSku, setConflictSku] = useState<string>()
  const [initial] = useState(() => JSON.stringify(values))
  const [discarding, setDiscarding] = useState(false)
  // Counts up on every failed save, so focus moves once the fieldset is enabled again.
  const [focusFailure, setFocusFailure] = useState(0)
  const [failedOnSku, setFailedOnSku] = useState(false)

  useEffect(() => {
    if (focusFailure && !pending) document.getElementById(failedOnSku ? 'vs-sku' : 'vs-submit')?.focus()
    // Only a new failure moves focus, not the later edits that change `failedOnSku`.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFailure, pending])

  const inFlight = useRef(false)
  const abort = useRef<AbortController | null>(null)
  const uploaded = useRef<string | undefined>(undefined)
  const fileInput = useRef<HTMLInputElement>(null)
  const preview = useRef(image?.preview)
  useEffect(() => {
    preview.current = image?.preview
  })
  // Leaving mid-request stops it; the chosen image's object URL is let go.
  useEffect(
    () => () => {
      abort.current?.abort()
      if (preview.current) URL.revokeObjectURL(preview.current)
    },
    [],
  )

  const errors = validateVariantForm(values, { mode })
  if (conflictSku && values.sku === conflictSku) errors.sku = `SKU ${conflictSku} is already used by another variant. Change the SKU.`
  const error = (key: string) => (attempted || touched.has(key) ? errors[key] : undefined)
  const touch = (key: string) => setTouched((old) => new Set(old).add(key))
  const unchanged = editing && Object.keys(buildVariantPatch(values, variant)).length === 0 && !image

  const dirty = JSON.stringify(values) !== initial || image !== null

  const set = (patch: Partial<VariantFormValues>) => setValues((old) => ({ ...old, ...patch }))

  function chooseImage(file: File | undefined) {
    if (!file) return
    const problem = checkImageFile(file)
    setImageNote(problem ?? undefined)
    if (fileInput.current) fileInput.current.value = ''
    if (problem) return
    if (image) URL.revokeObjectURL(image.preview)
    uploaded.current = undefined
    setProgress(undefined)
    setImage({ file, preview: URL.createObjectURL(file) })
  }

  function removeImage() {
    if (image) URL.revokeObjectURL(image.preview)
    uploaded.current = undefined
    setProgress(undefined)
    setImage(null)
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault()
    if (inFlight.current) return
    setAttempted(true)
    const first = Object.keys(errors)[0]
    if (first) {
      setBanner(null)
      document.getElementById(FIELD_ID[first] ?? `vs-${first.replace(':', '-')}`)?.focus()
      return
    }
    inFlight.current = true
    setPending(true)
    setBanner(null)
    const controller = (abort.current = new AbortController())
    let stage: 'upload' | 'save' = 'upload'
    try {
      // An image uploaded by an earlier try keeps its URL, so a retry only sends the variant.
      if (image && !uploaded.current) {
        setProgress(0)
        uploaded.current = await uploadImage(image.file, setProgress, controller.signal)
      }
      stage = 'save'
      if (editing) await saveVariant(productId, variant.id, buildVariantPatch(values, variant, uploaded.current), { signal: controller.signal })
      else await createVariant(productId, buildVariantInput(values, uploaded.current), { signal: controller.signal })
      onSaved()
    } catch (failure) {
      if (controller.signal.aborted) return
      const { kind = '' } = failure as { kind?: string }
      if (kind === 'conflict') setConflictSku(values.sku)
      setFailedOnSku(kind === 'conflict')
      setFocusFailure((n) => n + 1)
      setBanner({
        title: stage === 'upload' ? `Couldn't upload ${image?.file.name}.` : editing ? "Couldn't save the variant." : "Couldn't add the variant.",
        why: stage === 'upload' ? createFailureReason(failure, 'upload') : manageFailureReason(failure, editing ? 'save-variant' : 'add-variant'),
        retry: RETRYABLE.includes(kind),
      })
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  function requestClose() {
    if (pending) return
    if (discarding) setDiscarding(false)
    else if (dirty) setDiscarding(true)
    else onClose()
  }

  const row = 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'
  const footer = discarding ? (
    <div key="discard" className={row}>
      <button type="button" autoFocus onClick={() => setDiscarding(false)} className={PRIMARY_BUTTON}>
        Cancel
      </button>
      <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
        Discard changes
      </button>
    </div>
  ) : (
    <div className={row}>
      <button type="button" disabled={pending} onClick={requestClose} className={SECONDARY_BUTTON}>
        Cancel
      </button>
      <button id="vs-submit" type="submit" form={FORM_ID} disabled={pending || unchanged} className={PRIMARY_BUTTON}>
        {pending && <SpinnerIcon />}
        {editing ? (pending ? 'Saving…' : 'Save variant') : pending ? 'Adding…' : 'Add variant'}
      </button>
    </div>
  )

  const identityError = error('identity')
  const hexError = error('colorHex')
  return (
    <Modal variant="sheet" open onClose={requestClose} title={discarding ? 'Are you sure?' : editing ? 'Edit variant' : 'Add variant'} footer={footer}>
      {discarding && (
        <p className="pb-5 text-base leading-relaxed text-fg-muted">
          {editing ? "Your changes to this variant haven't been saved yet." : "This variant hasn't been added yet."} Closing now discards {editing ? 'them' : 'everything you entered'}, including any chosen image.
        </p>
      )}
      <form id={FORM_ID} noValidate hidden={discarding} onSubmit={submit} className="pb-5">
        <fieldset disabled={pending} className="m-0 grid min-w-0 gap-5 border-0 p-0">
          {banner && (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-line bg-canvas p-3">
              <AlertIcon size={20} className="mt-0.5 shrink-0 text-danger" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">{banner.title}</p>
                <p className="mt-1 text-sm text-fg-muted">{banner.why}</p>
                {banner.retry && (
                  <button type="button" onClick={() => void submit()} className={`${SECONDARY_BUTTON} mt-3 text-sm`}>
                    Try again
                  </button>
                )}
              </div>
            </div>
          )}

          <Field id="vs-size" label="Size" optional error={identityError}>
            <input
              id="vs-size"
              type="text"
              autoComplete="off"
              placeholder="e.g. M"
              value={values.size}
              aria-invalid={Boolean(identityError)}
              aria-describedby={describedBy('vs-size', identityError)}
              onChange={(event) => set({ size: filterSize(event.target.value) })}
              onBlur={() => touch('identity')}
              className={FIELD_INPUT}
            />
          </Field>

          <Field id="vs-color" label="Colour name" optional>
            <input
              id="vs-color"
              type="text"
              autoComplete="off"
              placeholder="e.g. Navy"
              value={values.color}
              aria-invalid={Boolean(identityError)}
              onChange={(event) => set({ color: filterColorName(event.target.value) })}
              onBlur={() => touch('identity')}
              className={FIELD_INPUT}
            />
          </Field>

          <div className="flex items-end gap-2">
            <input
              type="color"
              value={pickerValue(values.colorHex)}
              aria-label="Pick the colour"
              onChange={(event) => set({ colorHex: event.target.value })}
              className="size-11 shrink-0 cursor-pointer rounded-xl border border-line-strong bg-canvas p-1 disabled:opacity-60"
            />
            <div className="min-w-0 flex-1">
              <Field id="vs-hex" label="Colour hex" error={hexError}>
                <input
                  id="vs-hex"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={7}
                  placeholder="#1b1d21"
                  value={values.colorHex}
                  aria-invalid={Boolean(hexError)}
                  aria-describedby={describedBy('vs-hex', hexError)}
                  onChange={(event) => {
                    const digits = event.target.value.replace(/[^0-9a-f]/gi, '').slice(0, 6)
                    set({ colorHex: digits ? `#${digits}` : '' })
                  }}
                  onBlur={() => touch('colorHex')}
                  className={`${FIELD_INPUT} tabular-nums`}
                />
              </Field>
            </div>
          </div>
          <p className="-mt-3 text-sm text-fg-muted">The hex is needed when you enter a colour name.</p>

          <Field id="vs-name" label="Variant name" optional count={{ value: values.name.length, max: PRODUCT_LIMITS.variantNameMax }}>
            <input
              id="vs-name"
              type="text"
              autoComplete="off"
              value={values.name}
              aria-invalid={Boolean(identityError)}
              aria-describedby="vs-name-count"
              onChange={(event) => set({ name: filterText(event.target.value, PRODUCT_LIMITS.variantNameMax) })}
              onBlur={() => touch('identity')}
              className={FIELD_INPUT}
            />
          </Field>

          <Field id="vs-sku" label="SKU" optional={!editing} error={error('sku')}>
            <input
              id="vs-sku"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={editing ? undefined : 'Auto-generated if blank'}
              value={values.sku}
              aria-invalid={Boolean(error('sku'))}
              aria-describedby={describedBy('vs-sku', error('sku'))}
              onChange={(event) => set({ sku: filterSku(event.target.value) })}
              onBlur={() => touch('sku')}
              className={`${FIELD_INPUT} font-mono`}
            />
          </Field>

          <Field id="vs-price" label="Price (PHP)" error={error('price')}>
            <input
              id="vs-price"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={withCommas(values.price)}
              aria-invalid={Boolean(error('price'))}
              aria-describedby={describedBy('vs-price', error('price'))}
              onChange={(event) => set({ price: filterPrice(event.target.value) })}
              onBlur={() => touch('price')}
              className={`${FIELD_INPUT} text-right tabular-nums`}
            />
          </Field>

          {!editing && (
            <Field id="vs-stock" label="Stock" error={error('stock')}>
              <input
                id="vs-stock"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={withCommas(values.stock)}
                aria-invalid={Boolean(error('stock'))}
                aria-describedby={describedBy('vs-stock', error('stock'))}
                onChange={(event) => set({ stock: filterStock(event.target.value) })}
                onBlur={() => touch('stock')}
                className={`${FIELD_INPUT} text-right tabular-nums`}
              />
            </Field>
          )}

          <div className="grid gap-2">
            <p className="text-sm font-semibold text-fg">
              Image <span className="font-normal text-fg-muted">(optional; JPG, PNG or WebP, 5 MB)</span>
            </p>
            <input
              ref={fileInput}
              type="file"
              accept={IMAGE_TYPES.join(',')}
              tabIndex={-1}
              aria-label="Choose a variant image file"
              className="sr-only"
              onChange={(event) => chooseImage(event.target.files?.[0])}
            />
            {(image?.preview ?? variant?.imageUrl) && (
              <img src={image?.preview ?? variant?.imageUrl ?? ''} alt={image ? 'Preview of the new variant image' : 'Current variant image'} className="size-16 rounded-xl bg-line object-cover" />
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => fileInput.current?.click()} className={SMALL_BUTTON}>
                <PlusIcon className="mr-2" />
                {image || variant?.imageUrl ? 'Choose a different image' : 'Choose image'}
              </button>
              {image && (
                <button type="button" onClick={removeImage} className={SMALL_BUTTON}>
                  Remove
                </button>
              )}
            </div>
            {imageNote && (
              <p role="alert" className="text-sm text-danger">
                {imageNote}
              </p>
            )}
            {progress !== undefined && pending && (
              <div className="flex items-center gap-2">
                <progress max={100} value={progress} aria-label="Upload progress" className="h-2 min-w-0 flex-1" />
                <span className="w-10 text-right text-sm tabular-nums text-fg-muted">{progress}%</span>
              </div>
            )}
          </div>

          <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
            <legend className="text-sm font-semibold text-fg">AR garment measurements (cm)</legend>
            <p className="text-sm text-fg-muted">
              Optional. AR Fitting compares these with the shopper&apos;s body to show how the garment fits.{columns && ` Only the ones that apply to ${category?.toLowerCase()} are shown.`}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {fields.map(({ key, label, min, max }) => {
                const id = `vs-m-${key}`
                const problem = error(`m:${key}`)
                return (
                  <Field key={key} id={id} label={label} error={problem}>
                    <input
                      id={id}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder={`${min}–${max}`}
                      value={values.measurements[key]}
                      aria-invalid={Boolean(problem)}
                      aria-describedby={describedBy(id, problem)}
                      onChange={(event) => set({ measurements: { ...values.measurements, [key]: filterMeasurement(event.target.value) } })}
                      onBlur={() => touch(`m:${key}`)}
                      className={`${FIELD_INPUT} text-right tabular-nums`}
                    />
                  </Field>
                )
              })}
            </div>
          </fieldset>
        </fieldset>
      </form>
    </Modal>
  )
}
