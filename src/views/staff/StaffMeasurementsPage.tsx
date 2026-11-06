import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertIcon, PlusIcon, SpinnerIcon } from '../../components/form/icons'
import { CustomSizingList } from '../../components/staff/measurements/CustomSizingList'
import { CustomSizingSheet } from '../../components/staff/measurements/CustomSizingSheet'
import { MeasurementsList } from '../../components/staff/measurements/MeasurementsList'
import { SegmentedTabs } from '../../components/ui/SegmentedTabs'
import { SizeSheet } from '../../components/staff/measurements/SizeSheet'
import { SectionError } from '../../components/staff/StaffSection'
import { STAFF_SECTION } from '../../components/staff/StaffSkeleton'
import { useToast } from '../../components/toast/useToast'
import { PRIMARY_BUTTON, PRIMARY_BUTTON_SM, SECONDARY_BUTTON, SECONDARY_BUTTON_SM } from '../../components/ui/buttonStyles'
import { Modal } from '../../components/ui/Modal'
import { SampleDataBadge } from '../../components/ui/SampleDataBadge'
import { CATEGORIES, SIZES_BY_CATEGORY } from '../../data/products'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useSection } from '../../hooks/useSection'
import { setCustomSizingActive, useCustomSizings, type CustomSizing } from '../../service/customSizings'
import { fetchSizeMeasurements, setSizeMeasurementActive, sizeFailureReason, type SizeMeasurement } from '../../service/sizeMeasurements'
import type { RequestOptions } from '../../service/simulateRequest'
import { compareSizes } from '../../utils/sizeMeasurementValidation'

const META_DESCRIPTION = 'Manage the base measurements for each category and size: chest, waist, hip, length, inseam and more. They feed the size guide and the AR garment defaults.'

const CATEGORY_TABS = CATEGORIES.map((c) => ({ value: c as string, label: c }))
const STATUS_TABS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
] as const
type Status = (typeof STATUS_TABS)[number]['value']

const nameOf = (row: SizeMeasurement) => `${row.category} ${row.size}`

// How many rows each list had when it last loaded, so the next skeleton is as tall as the list that replaces it.
const rowCounts = new Map<string, number>()

export function StaffMeasurementsPage() {
  useDocumentTitle('Base measurements — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const category = CATEGORIES.find((c) => c === params.get('category')) ?? CATEGORIES[0]
  const status: Status = params.get('status') === 'archived' ? 'archived' : 'active'
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = () => setRefreshKey((n) => n + 1)
  const update = (changes: { category?: string; status?: Status }) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.set('category', changes.category ?? category)
      const nextStatus = changes.status ?? status
      if (nextStatus === 'archived') next.set('status', 'archived')
      else next.delete('status')
      return next
    })

  // `refreshKey` is not read inside: a new one loads the list again after a change.
  const fetcher = useCallback(
    (options: RequestOptions) => fetchSizeMeasurements({ category, status }, options).then((rows) => rows.sort((a, b) => compareSizes(a.size, b.size))),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [category, status, refreshKey],
  )
  const { state, retry } = useSection(fetcher)
  const rows = state.status === 'success' ? state.data : null
  const unavailable = state.status === 'error' && state.kind === 'not-found'

  const countKey = `${category}|${status}`
  useEffect(() => {
    if (rows) rowCounts.set(countKey, rows.length)
  }, [rows, countKey])
  const skeletonRows = Math.max(1, rowCounts.get(countKey) ?? SIZES_BY_CATEGORY[category]?.length ?? 1)

  // After a change the list reloads and the clicked button is gone. Focus waits on the list heading meanwhile (never on the page), and once
  // the list is back goes to the first action of the affected row (undefined: nothing pending; null: that row is not in the list, so the
  // heading), unless the user has moved focus on. After an Undo focus is still on the toast's button, which is on its way out, so it moves regardless.
  // `focusSize` names the row by its size when its id is not known yet (the active row behind a restore conflict).
  const addButton = useRef<HTMLButtonElement>(null)
  const listHeading = useRef<HTMLHeadingElement>(null)
  const focusRow = useRef<string | null | undefined>(undefined)
  const focusSize = useRef<string | null>(null)
  const fromToast = useRef(false)
  const holdFocus = () => listHeading.current?.focus({ preventScroll: true })
  useEffect(() => {
    if (focusRow.current === undefined || state.status === 'loading') return
    const id = focusRow.current ?? (rows && focusSize.current ? rows.find((r) => r.size === focusSize.current)?.id : null)
    focusRow.current = undefined
    focusSize.current = null
    const active = document.activeElement
    if (!fromToast.current && active && active !== document.body && active.isConnected && active !== addButton.current && active !== listHeading.current) return
    fromToast.current = false
    // The table and the cards are both in the DOM; only one is displayed.
    const buttons = id ? [...document.querySelectorAll<HTMLElement>(`[data-row-action="${CSS.escape(id)}"]`)] : []
    const target = buttons.find((button) => button.getClientRects().length > 0) ?? buttons[0] ?? listHeading.current
    target?.focus()
  }, [state, rows])

  // The sheet starts fresh each time it opens (a new key).
  const [sheet, setSheet] = useState<{ row?: SizeMeasurement; key: number } | null>(null)
  const openSheet = (row?: SizeMeasurement) => setSheet((old) => ({ row, key: (old?.key ?? 0) + 1 }))

  // Custom sizings are mock data kept in this browser (see service/customSizings).
  const sizings = useCustomSizings(category, status)
  const [sizingSheet, setSizingSheet] = useState<{ sizing?: CustomSizing; key: number } | null>(null)
  const openSizingSheet = (sizing?: CustomSizing) => setSizingSheet((old) => ({ sizing, key: (old?.key ?? 0) + 1 }))
  const [archivingSizing, setArchivingSizing] = useState<CustomSizing | null>(null)

  function changeSizing(sizing: CustomSizing, active: boolean, fromUndo = false) {
    if (!setCustomSizingActive(sizing.id, active)) {
      toast.show({ kind: 'error', message: `Couldn't restore ${sizing.name}. An active ${sizing.name} already exists in ${sizing.category}. Rename or archive that one first.` })
      return
    }
    toast.show({
      kind: 'success',
      message: `${sizing.name} ${active ? 'restored' : 'archived'}`,
      action: fromUndo ? undefined : { label: 'Undo', onClick: () => changeSizing(sizing, !active, true) },
    })
  }

  function onSaved(saved: SizeMeasurement) {
    const added = sheet?.row === undefined
    focusRow.current = saved.id
    if (added && rows && saved.category === category && status === 'active') rowCounts.set(countKey, rows.length + 1)
    holdFocus()
    setSheet(null)
    if (saved.category !== category || status !== 'active') update({ category: saved.category, status: 'active' })
    refresh()
    toast.show({ kind: 'success', message: `${nameOf(saved)} ${added ? 'added' : 'updated'}` })
  }

  const inFlight = useRef(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [archiving, setArchiving] = useState<SizeMeasurement | null>(null)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  // The modal focuses its panel as it opens, after the button's autoFocus; this effect runs after that and puts focus on the safe choice.
  const cancelArchive = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (archiving) cancelArchive.current?.focus()
  }, [archiving])

  /** Archives or restores one row. Resolves to null when it worked, or what went wrong (`conflict`: an active row of that size exists). */
  async function changeActive(row: SizeMeasurement, active: boolean, fromUndo = false): Promise<{ message: string; conflict: boolean } | null> {
    if (inFlight.current) return null
    inFlight.current = true
    setBusyId(row.id)
    try {
      await setSizeMeasurementActive(row.id, active)
    } catch (error) {
      const message = `Couldn't ${active ? 'restore' : 'archive'} ${nameOf(row)}. ${sizeFailureReason(error, nameOf(row))}`
      return { message, conflict: (error as { kind?: string } | null)?.kind === 'conflict' }
    } finally {
      inFlight.current = false
      setBusyId(null)
    }
    // An undo brings the row back; otherwise it left this tab, so the next row (or the previous, at the end) takes focus.
    const at = rows ? rows.findIndex((r) => r.id === row.id) : -1
    fromToast.current = fromUndo
    focusRow.current = fromUndo ? row.id : (rows?.[at + 1] ?? rows?.[at - 1])?.id ?? null
    if (rows) rowCounts.set(countKey, rows.length + (fromUndo ? 1 : -1))
    holdFocus()
    refresh()
    toast.show({
      kind: 'success',
      message: `${nameOf(row)} ${active ? 'restored' : 'archived'}`,
      action: fromUndo ? undefined : { label: 'Undo', onClick: () => void run(row, !active, true) },
    })
    return null
  }

  /** `changeActive` for callers with no place to show an error: it goes to a toast with a retry. */
  async function run(row: SizeMeasurement, active: boolean, fromUndo = false) {
    holdFocus() // the clicked button is disabled while the request is out, which would drop focus to the page
    const failure = await changeActive(row, active, fromUndo)
    if (!failure) return
    // Retrying a restore that hit an active duplicate cannot work until that one is edited, so the toast takes the user to it instead.
    const action = failure.conflict && active ? { label: `View active ${nameOf(row)}`, onClick: () => viewActive(row) } : { label: 'Retry', onClick: () => void run(row, active, fromUndo) }
    toast.show({ kind: 'error', message: failure.message, action })
  }

  /** Opens the Active tab with the row of the same size focused (the toast's button is still focused, so focus moves regardless). */
  function viewActive(row: SizeMeasurement) {
    fromToast.current = true
    focusRow.current = null
    focusSize.current = row.size
    holdFocus()
    update({ status: 'active' })
  }

  async function confirmArchive(panel: HTMLElement | null) {
    if (!archiving) return
    setArchiveError(null)
    panel?.focus() // the buttons are disabled while the request is out, which would drop focus to the page
    const failure = await changeActive(archiving, false)
    if (failure) {
      setArchiveError(failure.message)
      cancelArchive.current?.focus()
    } else setArchiving(null)
  }
  const closeArchive = () => {
    if (busyId) return
    setArchiving(null)
    setArchiveError(null)
  }

  const archivedView = status === 'archived'
  return (
    <div className="grid gap-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display text-2xl text-fg sm:text-3xl">Base measurements</h1>
          <p className="mt-1 text-xs text-fg-muted">The garment sizes, in cm, behind the size guide and the AR fitting defaults.</p>
          <p className="mt-1 h-5 text-sm text-fg-muted">
            {rows && (
              <>
                <span className="tabular-nums">{rows.length}</span> {archivedView ? 'archived ' : ''}
                {rows.length === 1 ? 'size' : 'sizes'} in {category}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => openSizingSheet()} className={`${SECONDARY_BUTTON_SM} min-h-11! min-w-11!`}>
            <PlusIcon />
            Add custom sizing
          </button>
          <button ref={addButton} type="button" onClick={() => openSheet()} className={`${PRIMARY_BUTTON_SM} min-h-11! min-w-11!`}>
            <PlusIcon />
            Add size
          </button>
        </div>
      </header>

      <section aria-labelledby="measurements-list" className={`${STAFF_SECTION} scroll-mt-14`}>
        <h2 ref={listHeading} id="measurements-list" tabIndex={-1} className="sr-only">
          {category} sizes
        </h2>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <SegmentedTabs label="Category" name="measure-category" options={CATEGORY_TABS} value={category} onChange={(next) => update({ category: next })} />
          <SegmentedTabs label="Size status" name="measure-status" options={STATUS_TABS} value={status} onChange={(next) => update({ status: next })} />
        </div>
        <p role="status" className="sr-only">
          {state.status === 'loading' ? 'Loading sizes' : ''}
        </p>

        {unavailable ? (
          <div role="status" className="flex items-start gap-3">
            <AlertIcon size={20} className="mt-0.5 shrink-0 text-fg-muted" />
            <div className="min-w-0">
              <p className="text-base font-semibold text-fg">Base measurements aren&apos;t available yet</p>
              <p className="mt-1 text-base text-fg-muted">The server doesn&apos;t have the measurements service yet, so sizes can&apos;t be listed or saved. Try again once it has been released.</p>
              <button type="button" onClick={retry} className={`${SECONDARY_BUTTON} mt-3`}>
                Retry
              </button>
            </div>
          </div>
        ) : state.status === 'error' ? (
          <SectionError what={`the ${category} sizes`} kind={state.kind} onRetry={retry} />
        ) : rows && rows.length === 0 ? (
          archivedView ? (
            <div>
              <p className="text-base font-semibold text-fg">No archived {category} sizes</p>
              <p className="mt-1 text-base text-fg-muted">Sizes you archive are hidden from the size guide and listed here, where you can restore them.</p>
            </div>
          ) : (
            <div>
              <p className="text-base font-semibold text-fg">No {category} sizes yet</p>
              <p className="mt-1 text-base text-fg-muted">Add the first size so the size guide and AR fitting have measurements to start from.</p>
              <button type="button" onClick={() => openSheet()} className={`${PRIMARY_BUTTON} mt-3`}>
                <PlusIcon />
                Add size
              </button>
            </div>
          )
        ) : (
          <MeasurementsList category={category} rows={rows} skeletonRows={skeletonRows} busyId={busyId} onEdit={openSheet} onArchive={setArchiving} onRestore={(row) => void run(row, true)} />
        )}
      </section>

      <section aria-labelledby="custom-sizings" className={`${STAFF_SECTION} scroll-mt-14`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="custom-sizings" className="text-lg font-semibold text-fg">
            Custom sizings
          </h2>
          <SampleDataBadge reason="Custom sizings are saved in this browser only until the sizing backend is connected." />
        </div>
        <p className="mt-1 text-sm text-fg-muted">Sizes that belong to one product line instead of following the {category} base sizes.</p>
        <div className="mt-3">
          {sizings.length === 0 && status === 'archived' ? (
            <div>
              <p className="text-base font-semibold text-fg">No archived {category} custom sizings</p>
              <p className="mt-1 text-base text-fg-muted">Sizings you archive are hidden from the size guide and the product form, and listed here, where you can restore them.</p>
            </div>
          ) : sizings.length === 0 ? (
            <div>
              <p className="text-base font-semibold text-fg">No {category} custom sizings yet</p>
              <p className="mt-1 text-base text-fg-muted">Add one when a product has its own sizes and measurements, such as &ldquo;{category} Custom&rdquo;.</p>
              <button type="button" onClick={() => openSizingSheet()} className={`${PRIMARY_BUTTON} mt-3`}>
                <PlusIcon />
                Add custom sizing
              </button>
            </div>
          ) : (
            <CustomSizingList category={category} sizings={sizings} onEdit={openSizingSheet} onArchive={setArchivingSizing} onRestore={(sizing) => changeSizing(sizing, true)} />
          )}
        </div>
      </section>

      {sizingSheet && (
        <CustomSizingSheet
          key={sizingSheet.key}
          sizing={sizingSheet.sizing}
          category={category}
          onClose={() => setSizingSheet(null)}
          onSaved={(saved) => {
            setSizingSheet(null)
            toast.show({ kind: 'success', message: sizingSheet.sizing ? `${saved.name} updated` : `${saved.name} added to ${saved.category}` })
          }}
        />
      )}

      {sheet && <SizeSheet key={sheet.key} row={sheet.row} category={category} onSaved={onSaved} onClose={() => setSheet(null)} />}

      <Modal
        open={archivingSizing !== null}
        onClose={() => setArchivingSizing(null)}
        title="Are you sure?"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" autoFocus onClick={() => setArchivingSizing(null)} className={PRIMARY_BUTTON}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (archivingSizing) changeSizing(archivingSizing, false)
                setArchivingSizing(null)
              }}
              className={SECONDARY_BUTTON}
            >
              Archive sizing
            </button>
          </div>
        }
      >
        {archivingSizing && (
          <p className="pb-5 text-base leading-relaxed text-fg-muted">
            {archivingSizing.name} will be hidden from the size guide, the AR fitting and the product form. Products that use it show their sizes without measurements until you restore it from the Archived tab.
          </p>
        )}
      </Modal>

      <Modal
        open={archiving !== null}
        onClose={closeArchive}
        title="Are you sure?"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button ref={cancelArchive} type="button" disabled={busyId !== null} onClick={closeArchive} className={PRIMARY_BUTTON}>
              Cancel
            </button>
            <button type="button" disabled={busyId !== null} onClick={(event) => void confirmArchive(event.currentTarget.closest<HTMLElement>('[role="dialog"]'))} className={SECONDARY_BUTTON}>
              {busyId !== null && <SpinnerIcon />}
              {busyId !== null ? 'Archiving…' : 'Archive size'}
            </button>
          </div>
        }
      >
        {archiving && (
          <div className="grid gap-3 pb-5">
            <p className="text-base leading-relaxed text-fg-muted">
              {nameOf(archiving)} will be hidden from the size guide and the AR fitting defaults. You can restore it from the Archived tab.
            </p>
            {archiveError && (
              <p role="alert" className="text-sm text-danger">
                {archiveError}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
