import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CATEGORIES, SIZES_BY_CATEGORY, type Category } from '../../../data/products'
import type { Gender } from '../../../service/fetchProductList'
import { addCustomSizing, getCustomSizings, getProductSizingId, linkProductSizing, useCustomSizings } from '../../../service/customSizings'
import { fetchCategoryMeasurements } from '../../../service/sizeMeasurements'
import { baseMeasurementsFor } from '../../../utils/sizeGuide'
import { addProduct, createFailureReason, manageFailureReason, saveProduct, uploadImage } from '../../../service/inventoryActions'
import { buildCustomSizing, draftSizes, newSizingDraft, validateSizingDraft } from '../../../utils/customSizing'
import { GENDERS } from '../../../utils/inventoryQuery'
import {
  buildProductInput,
  buildProductPatch,
  buildSkus,
  describedBy,
  newColor,
  filterMultiline,
  filterPrice,
  formatPriceInput,
  filterText,
  PRODUCT_LIMITS,
  validateProductForm,
  variantRows,
  type ProductEditSource,
  type ProductFormValues,
} from '../../../utils/productValidation'
import { AlertIcon, SpinnerIcon } from '../../form/icons'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { Checkbox } from '../../ui/Checkbox'
import { Modal } from '../../ui/Modal'
import { Select } from '../../ui/Select'
import { Field, FIELD_INPUT, SELECT_FLAT, SelectField } from './FormField'
import { SizingPicker } from './SizingPicker'
import { ImageUploader } from './ImageUploader'
import { VariantBuilder } from './VariantBuilder'

const FORM_ID = 'product-form'
const GENDER_OPTIONS = [{ value: '', label: 'Not specified' }, ...GENDERS]
const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({
  value: c as string,
  label: c,
}))
const RETRYABLE = ['network', 'rate-limit', 'server']

const initialValues = (): ProductFormValues => ({
  name: '',
  category: CATEGORIES[0],
  gender: '',
  arReady: false,
  description: '',
  basePrice: '',
  images: [],
  sizes: SIZES_BY_CATEGORY[CATEGORIES[0]],
  custom: [],
  sizingMode: 'base',
  sizingId: '',
  sizingDraft: newSizingDraft(),
  colors: [newColor()],
  edits: {},
})

/** The form for an existing product: its own fields only, and its current images as drafts (no file, so they are not uploaded again). */
const editValues = (p: ProductEditSource): ProductFormValues => {
  const sizingId = getProductSizingId(p.id)
  return {
    ...initialValues(),
    sizingMode: sizingId ? 'custom' : 'base',
    sizingId,
    name: p.name,
    brand: p.brand ?? '',
    category: p.category as Category,
    gender: p.gender ?? '',
    arReady: p.isArReady,
    description: p.description ?? '',
    images: p.images.map((image, index) => ({
      id: `existing${index}`,
      preview: image.url,
      url: image.url,
      alt: image.altText,
    })),
    sizes: [],
    colors: [],
  }
}

const snapshot = (v: ProductFormValues) => JSON.stringify({ ...v, images: v.images.map((i) => [i.id, i.alt]) })

interface Banner {
  title: string
  why: string
  retry: boolean
}

interface ProductFormSheetProps {
  open: boolean
  /** Called when the sheet should close (Cancel, Escape, the backdrop), once any unsaved work has been dropped. */
  onClose: () => void
  /** The product was created. The page closes the sheet, refreshes the list and shows the toast. */
  onCreated?: (product: { id: string; name: string }) => void
  /** Set to edit this product instead of adding one; the sheet then saves only what changed. */
  product?: ProductEditSource
  /** The edits were saved (edit mode). */
  onSaved?: (name: string) => void
}

/** The Add product sheet, or with `product` the Edit details sheet. Mount it with a new `key` each time it opens so it starts fresh. */
export function ProductFormSheet({ open, onClose, onCreated, product, onSaved }: ProductFormSheetProps) {
  const editing = product !== undefined
  const [values, setValues] = useState(() => (product ? editValues(product) : initialValues()))
  const [initial] = useState(() => snapshot(values))
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set())
  const [attempted, setAttempted] = useState(false)
  const [pending, setPending] = useState(false)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [conflictSku, setConflictSku] = useState<string>()
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [discarding, setDiscarding] = useState(false)
  const [focusSummary, setFocusSummary] = useState(0)

  const sizesTouched = useRef(false)
  const inFlight = useRef(false)
  const abort = useRef<AbortController | null>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const latest = useRef(values)
  useEffect(() => {
    latest.current = values
  })

  // Leaving mid-request stops it; the thumbnails' object URLs are let go.
  useEffect(
    () => () => {
      abort.current?.abort()
      for (const image of latest.current.images) URL.revokeObjectURL(image.preview)
    },
    [],
  )

  // An edited product's own category is listed even when the shop does not know it, so saving never changes it by accident.
  const categoryOptions =
    product && !CATEGORY_OPTIONS.some((o) => o.value === product.category) ? [{ value: product.category, label: product.category }, ...CATEGORY_OPTIONS] : CATEGORY_OPTIONS
  const customSizing = values.sizingMode === 'custom'
  const newSizing = customSizing && !values.sizingId
  const takenNames = useCustomSizings(values.category).map((s) => s.name)
  const { sizes: sizesError, ...formErrors }: Record<string, string> = validateProductForm(values, {
    conflictSku,
    mode: editing ? 'edit' : 'create',
  })
  const sizingErrors = newSizing
    ? Object.fromEntries(Object.entries(validateSizingDraft(values.sizingDraft, values.category, takenNames)).map(([key, message]) => [`sizing:${key}`, message]))
    : {}
  // A custom sizing's sizes come from its rows, whose own errors say what is missing.
  const errors: Record<string, string> = {
    ...formErrors,
    ...(sizesError && !customSizing && { sizes: sizesError }),
    ...sizingErrors,
  }
  // An edited product's category may not be one of ours, which has no sizes to build SKUs from.
  const skus = editing ? {} : buildSkus(values)
  const dirty = snapshot(values) !== initial
  const error = (key: string) => (attempted || touched.has(key) ? errors[key] : undefined)
  const touch = (key: string) => setTouched((old) => new Set(old).add(key))
  const errorKeys = Object.keys(errors)
  const visible = Object.fromEntries(errorKeys.filter((key) => error(key)).map((key) => [key, errors[key]]))

  function set(patch: Partial<ProductFormValues>) {
    if (patch.sizes || patch.custom) sizesTouched.current = true
    // Until sizes are picked by hand, they follow the category.
    const next = patch.category && !sizesTouched.current && !patch.sizes ? { ...patch, sizes: SIZES_BY_CATEGORY[patch.category] } : patch
    setValues((old) => {
      let v = { ...old, ...next }
      // Another category has other columns and base sizes, so a custom sizing does not carry over.
      if (patch.category && patch.category !== old.category && old.sizingMode === 'custom')
        v = {
          ...v,
          sizingMode: 'base',
          sizingId: '',
          sizingDraft: newSizingDraft(),
          sizes: SIZES_BY_CATEGORY[patch.category],
          custom: [],
        }
      if (v.sizingMode !== 'custom') return v
      const saved = getCustomSizings().find((s) => s.id === v.sizingId)
      return {
        ...v,
        sizes: saved ? saved.sizes.map((s) => s.size) : draftSizes(v.sizingDraft),
        custom: [],
      }
    })
  }

  useEffect(() => {
    if (focusSummary) summaryRef.current?.focus()
  }, [focusSummary])

  function focusField(key: string) {
    const [kind, rest] = key.split(/:(.*)/s)
    const id = key === 'basePrice' ? 'pf-base-price' : rest ? `pf-${kind}-${rest}` : `pf-${kind}`
    const target = document.getElementById(id)
    const control = target?.matches('input, button, textarea') ? target : target?.querySelector<HTMLElement>('input, button')
    ;(control ?? target)?.focus()
  }

  function labelFor(key: string) {
    const [kind, rest] = key.split(/:(.*)/s)
    const row = variantRows(values).find((r) => r.key === rest)
    const rowName = row ? `${row.color} ${row.size}` : ''
    const colorIndex = values.colors.findIndex((c) => c.id === rest) + 1
    const names: Record<string, string> = {
      name: 'Name',
      description: 'Description',
      basePrice: 'Base price',
      images: 'Images',
      sizing: 'Custom sizing',
      sizes: 'Sizes',
      colors: 'Colours',
      matrix: 'Variants',
      alt: 'Image alt text',
      'color-name': `Colour ${colorIndex} name`,
      'color-hex': `Colour ${colorIndex} hex`,
      sku: `${rowName} SKU`,
      stock: `${rowName} stock`,
      price: `${rowName} price override`,
    }
    return names[kind] ?? kind
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault()
    if (inFlight.current) return
    setAttempted(true)
    if (errorKeys.length > 0) {
      setBanner(null)
      setFocusSummary((n) => n + 1)
      return
    }
    inFlight.current = true
    setPending(true)
    setBanner(null)
    const controller = (abort.current = new AbortController())
    let stage: 'upload' | 'create' = 'upload'
    let uploading = ''
    try {
      // Files already uploaded by an earlier try keep their URL, so a retry only sends what is missing.
      const urls: Record<string, string> = {}
      for (const image of latest.current.images) {
        let url = image.url
        if (!url && image.file) {
          uploading = image.file.name
          setProgress((old) => ({ ...old, [image.id]: 0 }))
          const uploaded = await uploadImage(image.file, (percent) => setProgress((old) => ({ ...old, [image.id]: percent })), controller.signal)
          url = uploaded
          setValues((old) => ({
            ...old,
            images: old.images.map((i) => (i.id === image.id ? { ...i, url: uploaded } : i)),
          }))
        }
        urls[image.id] = url ?? ''
      }
      stage = 'create'
      if (product) {
        // A sizing-only change has nothing for the API (the link is mock for now).
        const patch = buildProductPatch(latest.current, urls, product)
        if (Object.keys(patch).length > 0) await saveProduct(product.id, patch, { signal: controller.signal })
        const { sizingMode, sizingId, sizingDraft, category } = latest.current
        linkProductSizing(product.id, sizingMode === 'custom' ? sizingId || addCustomSizing(buildCustomSizing(sizingDraft, category)).id : null)
        onSaved?.(latest.current.name.trim())
      } else {
        // On the category's base sizing each variant starts with its size's base measurements (a copy; none when they cannot be read).
        const input = buildProductInput(latest.current, urls)
        if (latest.current.sizingMode === 'base') {
          const baseRows = await fetchCategoryMeasurements(latest.current.category).catch(() => [])
          input.variants = input.variants.map((variant) => {
            const measurements = baseMeasurementsFor(latest.current.category, variant.size, baseRows)
            return measurements ? { ...variant, measurements } : variant
          })
        }
        const created = await addProduct(input, { signal: controller.signal })
        // The product and its sizing are linked here (mock) until the API stores the link.
        const { sizingMode, sizingId, sizingDraft, category } = latest.current
        if (sizingMode === 'custom') linkProductSizing(created.id, sizingId || addCustomSizing(buildCustomSizing(sizingDraft, category)).id)
        onCreated?.(created)
      }
    } catch (failure) {
      if (controller.signal.aborted) return
      const { kind = '', detail = '' } = failure as {
        kind?: string
        detail?: string
      }
      const name = latest.current.name.trim()
      const conflict = kind === 'conflict' && !editing ? Object.entries(skus).find(([, sku]) => detail.toUpperCase().includes(sku.toUpperCase())) : undefined
      if (conflict) {
        setConflictSku(conflict[1])
        touch(`sku:${conflict[0]}`)
      }
      setBanner({
        title:
          stage === 'upload'
            ? `Couldn't upload ${uploading}.`
            : conflict
              ? `${conflict[1]} is already used, so ${name} wasn't created.`
              : editing
                ? `Couldn't save the changes to ${product.name}.`
                : `Couldn't create ${name}.`,
        why: editing && stage === 'create' ? manageFailureReason(failure, 'save-product') : createFailureReason(failure, stage),
        retry: RETRYABLE.includes(kind),
      })
      if (conflict) setTimeout(() => focusField(`sku:${conflict[0]}`))
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
      <button type="submit" form={FORM_ID} disabled={pending || (editing && !dirty)} className={PRIMARY_BUTTON}>
        {pending && <SpinnerIcon />}
        {editing ? (pending ? 'Saving…' : 'Save changes') : pending ? 'Creating…' : 'Create product'}
      </button>
    </div>
  )

  const shown = attempted ? errorKeys : []
  return (
    <Modal variant="sheet" open={open} onClose={requestClose} title={discarding ? 'Are you sure?' : editing ? 'Edit details' : 'Add product'} footer={footer}>
      {discarding ? (
        <p className="pb-5 text-base leading-relaxed text-fg-muted">
          {editing
            ? `Your changes to ${product.name} haven't been saved yet.`
            : values.name.trim()
              ? `${values.name.trim()} hasn't been created yet.`
              : "This product hasn't been created yet."}{' '}
          Closing now discards {editing ? 'them' : 'everything you entered'}, including any chosen images.
        </p>
      ) : (
        <form id={FORM_ID} noValidate onSubmit={submit} className="pb-5">
          <fieldset disabled={pending} className="m-0 grid min-w-0 gap-5 border-0 p-0">
            {shown.length > 0 && (
              <div ref={summaryRef} role="alert" tabIndex={-1} className="rounded-xl border border-danger p-3 outline-none">
                <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                  <AlertIcon size={20} className="shrink-0 text-danger" />
                  {shown.length === 1 ? 'Fix 1 problem' : `Fix ${shown.length} problems`} before {editing ? 'saving the changes' : 'creating the product'}
                </p>
                <ul className="mt-2 grid gap-1 text-sm">
                  {shown.slice(0, 6).map((key) => (
                    <li key={key}>
                      <a
                        href={`#${key}`}
                        onClick={(event) => {
                          event.preventDefault()
                          focusField(key)
                        }}
                        className="text-fg underline"
                      >
                        {labelFor(key)}: {errors[key]}
                      </a>
                    </li>
                  ))}
                  {shown.length > 6 && <li className="text-fg-muted">and {shown.length - 6} more below</li>}
                </ul>
              </div>
            )}
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

            <Field id="pf-name" label="Name" count={{ value: values.name.length, max: PRODUCT_LIMITS.nameMax }} error={error('name')}>
              <input
                id="pf-name"
                type="text"
                autoComplete="off"
                value={values.name}
                aria-invalid={Boolean(error('name'))}
                aria-describedby={[describedBy('pf-name', error('name'), true), editing && 'pf-name-note'].filter(Boolean).join(' ') || undefined}
                onChange={(event) =>
                  set({
                    name: filterText(event.target.value, PRODUCT_LIMITS.nameMax),
                  })
                }
                onBlur={() => touch('name')}
                className={FIELD_INPUT}
              />
              {editing && (
                <p id="pf-name-note" className="text-xs text-fg-muted">
                  Changing the name also changes the product&apos;s web address.
                </p>
              )}
            </Field>

            {editing && (
              <Field
                id="pf-brand"
                label="Brand"
                optional
                count={{
                  value: (values.brand ?? '').length,
                  max: PRODUCT_LIMITS.brandMax,
                }}
              >
                <input
                  id="pf-brand"
                  type="text"
                  autoComplete="off"
                  value={values.brand ?? ''}
                  aria-describedby="pf-brand-count"
                  onChange={(event) =>
                    set({
                      brand: filterText(event.target.value, PRODUCT_LIMITS.brandMax),
                    })
                  }
                  className={FIELD_INPUT}
                />
              </Field>
            )}

            <SelectField label="Category">
              <Select
                label="Category"
                value={values.category as string}
                options={categoryOptions}
                onChange={(category) => set({ category: category as Category })}
                className={SELECT_FLAT}
              />
            </SelectField>

            <div className="grid gap-1">
              <SelectField label="Gender (optional)">
                <Select
                  label="Gender"
                  value={values.gender}
                  options={product?.gender ? GENDER_OPTIONS.slice(1) : GENDER_OPTIONS}
                  onChange={(gender) => set({ gender: gender as Gender | '' })}
                  className={SELECT_FLAT}
                />
              </SelectField>
              {product?.gender && <p className="text-xs text-fg-muted">A gender can be changed but not removed once it is set.</p>}
            </div>

            <div className="grid gap-1">
              <Checkbox label="AR Fitting ready" checked={values.arReady} onChange={(arReady) => set({ arReady })} className="justify-start">
                <span className="text-base font-semibold">AR Fitting ready</span>
              </Checkbox>
              <p className="text-xs text-fg-muted">Shoppers can try this item on in AR Fitting.</p>
            </div>

            {editing && <SizingPicker values={values} disabled={pending} error={error} touch={touch} set={set} editing />}

            <Field
              id="pf-description"
              label="Description"
              optional
              count={{
                value: values.description.length,
                max: PRODUCT_LIMITS.descriptionMax,
              }}
              error={error('description')}
            >
              <textarea
                id="pf-description"
                rows={4}
                value={values.description}
                aria-invalid={Boolean(error('description'))}
                aria-describedby={describedBy('pf-description', error('description'), true)}
                onChange={(event) =>
                  set({
                    description: filterMultiline(event.target.value, PRODUCT_LIMITS.descriptionMax),
                  })
                }
                onBlur={() => touch('description')}
                className={`${FIELD_INPUT} py-2`}
              />
            </Field>

            {!editing && (
              <Field id="pf-base-price" label="Base price (PHP)" error={error('basePrice')}>
                <input
                  id="pf-base-price"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  value={formatPriceInput(values.basePrice)}
                  aria-invalid={Boolean(error('basePrice'))}
                  aria-describedby={describedBy('pf-base-price', error('basePrice'))}
                  onChange={(event) => set({ basePrice: filterPrice(event.target.value) })}
                  onBlur={() => touch('basePrice')}
                  className={`${FIELD_INPUT} text-right tabular-nums`}
                />
              </Field>
            )}

            <ImageUploader
              images={values.images}
              name={values.name.trim()}
              progress={progress}
              disabled={pending}
              error={error('images')}
              errors={visible}
              onChange={(images) => {
                set({ images })
                touch('images')
              }}
            />

            {!editing && <VariantBuilder values={values} skus={skus} disabled={pending} error={error} touch={touch} set={set} />}
          </fieldset>
        </form>
      )}
    </Modal>
  )
}
