import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CATEGORIES, SIZES_BY_CATEGORY } from '../../../data/products'
import { createSizeMeasurement, fetchSizeMeasurement, sizeFailureReason, updateSizeMeasurement, type SizeMeasurement } from '../../../service/sizeMeasurements'
import { describedBy, filterMeasurement, MEASUREMENT_FIELDS } from '../../../utils/productValidation'
import { COLUMNS_BY_CATEGORY, buildSizeInput, buildSizePatch, filterSizeLabel, SIZE_MAX, sizeFormValues, validateSizeForm, type SizeFormValues } from '../../../utils/sizeMeasurementValidation'
import { AlertIcon, SpinnerIcon } from '../../form/icons'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { Modal } from '../../ui/Modal'
import { Select } from '../../ui/Select'
import { Field, FIELD_INPUT, SELECT_FLAT, SelectField } from '../inventory/FormField'

const FORM_ID = 'size-form'
const MEASUREMENTS_HELP = 'Fill in the ones that apply to this garment; at least one is needed. Leave the rest empty.'
const RETRYABLE = ['network', 'rate-limit', 'server']
const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c as string, label: c }))
/** The field each error key belongs to, to move focus to the first problem. */
const FIELD_ID: Record<string, string> = { size: 'ss-size', measurements: 'ss-m-chestWidthCm' }

interface SizeSheetProps {
  /** The row being edited; left out to add a size. */
  row?: SizeMeasurement
  /** The category the page is showing, which a new size starts in. */
  category: string
  /** The row was saved. The page closes the sheet, refreshes and shows the toast. */
  onSaved: (saved: SizeMeasurement) => void
  onClose: () => void
}

/**
 * Add a size to a category, or edit one: the size label and the measurements in cm that apply to its category. Mount it fresh for each row.
 * An edit first reads the row again (GET /size-measurements/:id), so a row changed since the list loaded is not saved over from a stale copy.
 */
export function SizeSheet({ row: listed, category, onSaved, onClose }: SizeSheetProps) {
  const [row, setRow] = useState(listed)
  const editing = row !== undefined
  const [values, setValues] = useState(() => sizeFormValues(category, listed))
  const [initial, setInitial] = useState(() => JSON.stringify(values))
  const [load, setLoad] = useState<{ failure?: unknown } | null>(listed ? {} : null)
  const [attempt, setAttempt] = useState(0)
  const listedId = listed?.id

  useEffect(() => {
    if (!listedId) return
    const controller = new AbortController()
    fetchSizeMeasurement(listedId, { signal: controller.signal }).then(
      (fresh) => {
        const loaded = sizeFormValues(category, fresh)
        setRow(fresh)
        setValues(loaded)
        setInitial(JSON.stringify(loaded))
        setLoad(null)
      },
      (failure: unknown) => {
        if (!controller.signal.aborted) setLoad({ failure })
      },
    )
    return () => controller.abort()
    // Only the row to open (or a retry) reads it again, not the page's category.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [listedId, attempt])
  const loadFailure = load?.failure
  const loadKind = (loadFailure as { kind?: string } | undefined)?.kind ?? ''
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set())
  const [attempted, setAttempted] = useState(false)
  const [pending, setPending] = useState(false)
  const [banner, setBanner] = useState<{ title: string; why: string; retry: boolean } | null>(null)
  // The category and size the server said already exist, to keep the message while they stay unchanged.
  const [conflict, setConflict] = useState<string>()
  const [discarding, setDiscarding] = useState(false)
  // Counts up on every failed save, so focus moves once the fieldset is enabled again.
  const [focusFailure, setFocusFailure] = useState(0)

  useEffect(() => {
    if (focusFailure && !pending) document.getElementById(conflict ? 'ss-size' : 'ss-submit')?.focus()
    // Only a new failure moves focus, not the later edits that change `conflict`.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFailure, pending])

  const inFlight = useRef(false)
  const abort = useRef<AbortController | null>(null)
  // Leaving mid-request stops it.
  useEffect(() => () => abort.current?.abort(), [])

  const label = `${values.category} ${values.size.trim()}`
  const errors = validateSizeForm(values)
  if (conflict && conflict === label) errors.size = `An active ${label} already exists. Edit that one, or use a different size.`
  const error = (key: string) => (attempted || touched.has(key) ? errors[key] : undefined)
  const touch = (key: string) => setTouched((old) => new Set(old).add(key))
  const unchanged = editing && Object.keys(buildSizePatch(values, row)).length === 0
  const dirty = JSON.stringify(values) !== initial

  const set = (patch: Partial<SizeFormValues>) => setValues((old) => ({ ...old, ...patch }))

  // Only the measurements that make sense for the category (no sleeve on pants). One the row already has stays, so it can still be changed or cleared.
  const columns = COLUMNS_BY_CATEGORY[values.category]
  const fields = MEASUREMENT_FIELDS.filter(({ key }) => !columns || columns.includes(key) || (row && row[key] !== null))

  // A new category has other columns, so what was typed in a box it no longer shows is dropped rather than saved unseen.
  function changeCategory(next: string) {
    const kept = COLUMNS_BY_CATEGORY[next]
    setValues((old) => ({
      ...old,
      category: next,
      measurements: Object.fromEntries(MEASUREMENT_FIELDS.map(({ key }) => [key, !kept || kept.includes(key) ? old.measurements[key] : ''])) as SizeFormValues['measurements'],
    }))
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault()
    if (inFlight.current) return
    setAttempted(true)
    const first = Object.keys(errors)[0]
    if (first) {
      setBanner(null)
      document.getElementById(FIELD_ID[first] ?? `ss-${first.replace(':', '-')}`)?.focus()
      return
    }
    inFlight.current = true
    setPending(true)
    setBanner(null)
    const controller = (abort.current = new AbortController())
    try {
      const saved = editing
        ? await updateSizeMeasurement(row.id, buildSizePatch(values, row), { signal: controller.signal })
        : await createSizeMeasurement(buildSizeInput(values), { signal: controller.signal })
      onSaved(saved)
    } catch (failure) {
      if (controller.signal.aborted) return
      const { kind = '' } = failure as { kind?: string }
      setConflict(kind === 'conflict' ? label : undefined)
      setFocusFailure((n) => n + 1)
      setBanner({
        title: editing ? "Couldn't save the size." : "Couldn't add the size.",
        why: sizeFailureReason(failure, label, !editing),
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

  const buttons = 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'
  const footer = load ? (
    <div className={buttons}>
      {loadFailure === undefined ? (
        // Same two buttons as the loaded form, so the sheet does not change height when it loads.
        <>
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          <button type="button" disabled className={PRIMARY_BUTTON}>
            Save size
          </button>
        </>
      ) : (
        <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
          Close
        </button>
      )}
      {loadFailure !== undefined && RETRYABLE.includes(loadKind) && (
        <button
          type="button"
          onClick={() => {
            setLoad({})
            setAttempt((n) => n + 1)
          }}
          className={PRIMARY_BUTTON}
        >
          Try again
        </button>
      )}
    </div>
  ) : discarding ? (
    <div key="discard" className={buttons}>
      <button type="button" autoFocus onClick={() => setDiscarding(false)} className={PRIMARY_BUTTON}>
        Cancel
      </button>
      <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
        Discard changes
      </button>
    </div>
  ) : (
    <div className={buttons}>
      <button type="button" disabled={pending} onClick={requestClose} className={SECONDARY_BUTTON}>
        Cancel
      </button>
      <button id="ss-submit" type="submit" form={FORM_ID} disabled={pending || unchanged} className={PRIMARY_BUTTON}>
        {pending && <SpinnerIcon />}
        {editing ? (pending ? 'Saving…' : 'Save size') : pending ? 'Adding…' : 'Add size'}
      </button>
    </div>
  )

  const sizeError = error('size')
  const noneError = error('measurements')
  return (
    <Modal variant="sheet" open onClose={load ? onClose : requestClose} title={discarding ? 'Are you sure?' : editing ? 'Edit size' : 'Add size'} footer={footer}>
      {discarding && (
        <p className="pb-5 text-base leading-relaxed text-fg-muted">
          {editing ? "Your changes to this size haven't been saved yet." : "This size hasn't been added yet."} Closing now discards {editing ? 'them' : 'everything you entered'}.
        </p>
      )}
      {load && loadFailure !== undefined && (
        <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-line bg-canvas p-3">
          <AlertIcon size={20} className="mt-0.5 shrink-0 text-danger" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg">Couldn&apos;t open the size.</p>
            <p className="mt-1 text-sm text-fg-muted">{sizeFailureReason(loadFailure, label)}</p>
          </div>
        </div>
      )}
      {load && loadFailure === undefined && (
        <div role="status" aria-label="Loading the size" className="grid animate-pulse gap-5 pb-5">
          <div className="grid gap-1">
            <div className="h-4 w-16 rounded-md bg-line" />
            <div className="h-5 w-24 rounded-md bg-line" />
          </div>
          <div className="grid gap-1">
            <div className="field--compact h-(--field-h) rounded-xl bg-line" />
            <div className="ml-auto h-4 w-8 rounded-md bg-line" />
          </div>
          <div className="grid gap-3">
            <div>
              <p className="text-sm font-semibold text-fg">Measurements (cm)</p>
              <p className="text-xs text-fg-muted">{MEASUREMENTS_HELP}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {fields.map(({ key }) => (
                <div key={key} className="field--compact h-(--field-h) rounded-xl bg-line" />
              ))}
            </div>
          </div>
        </div>
      )}
      <form id={FORM_ID} noValidate hidden={discarding || load !== null} onSubmit={submit} className="pb-5">
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

          {editing ? (
            <div className="grid gap-1">
              <p className="text-xs text-fg-muted">Category</p>
              <p className="text-sm text-fg">{values.category}</p>
            </div>
          ) : (
            <SelectField label="Category">
              <Select label="Category" value={values.category} options={CATEGORY_OPTIONS} onChange={changeCategory} className={SELECT_FLAT} />
            </SelectField>
          )}

          <Field id="ss-size" label="Size" count={{ value: values.size.length, max: SIZE_MAX }} error={sizeError}>
            <input
              id="ss-size"
              type="text"
              autoComplete="off"
              list="ss-size-options"
              placeholder={`e.g. ${SIZES_BY_CATEGORY[values.category]?.[0] ?? 'M'}`}
              value={values.size}
              aria-invalid={Boolean(sizeError)}
              aria-describedby={describedBy('ss-size', sizeError, true)}
              onChange={(event) => set({ size: filterSizeLabel(event.target.value) })}
              onBlur={() => touch('size')}
              className={FIELD_INPUT}
            />
            <datalist id="ss-size-options">
              {(SIZES_BY_CATEGORY[values.category] ?? []).map((size) => (
                <option key={size} value={size} />
              ))}
            </datalist>
          </Field>

          <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
            <legend className="text-sm font-semibold text-fg">Measurements (cm)</legend>
            <p className="text-xs text-fg-muted">{MEASUREMENTS_HELP}</p>
            {noneError && (
              <p id="ss-measurements-error" role="alert" className="text-sm text-danger">
                {noneError}
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {fields.map(({ key, label: name, min, max }) => {
                const id = `ss-m-${key}`
                const problem = error(`m:${key}`)
                return (
                  <Field key={key} id={id} label={name} error={problem}>
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
