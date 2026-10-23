import { useCallback, useEffect, useRef, useState } from 'react'
import { useSection } from '../../../hooks/useSection'
import { fetchProductDetail, type ProductListItem, type ProductVariant } from '../../../service/fetchProductList'
import { failureReason, saveArReady, saveStocks } from '../../../service/inventoryActions'
import { INVENTORY_SAMPLE_DATA, sampleProductDetail } from '../../../service/sampleInventory'
import type { RequestOptions } from '../../../service/simulateRequest'
import { editedVariants, parseStock } from '../../../utils/stockEdit'
import { AlertIcon, SpinnerIcon } from '../../form/icons'
import { useToast } from '../../toast/useToast'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { Modal } from '../../ui/Modal'
import { isArchived } from '../../../utils/inventoryQuery'
import { ProductDetail } from './ProductDetail'

/** Stands in for the detail request while no product is selected. It never answers. */
const IDLE = new Promise<{ variants: ProductVariant[] }>(() => {})

const sizes = (n: number) => `${n} ${n === 1 ? 'size' : 'sizes'}`

const DISCARD_ID = 'inventory-discard'
const ARCHIVE_ID = 'inventory-archive'

type Prompt = { kind: 'archive' } | { kind: 'discard'; close: boolean }

interface InventoryDrawerProps {
  /** The product to show; it stays set while the drawer slides out. */
  product: ProductListItem | null
  open: boolean
  /** Counts up on every open, so the drawer starts from the read-only view (or the stock editor, with `startEditing`) and loads the variants again. */
  session: number
  startEditing: boolean
  /** Counts up whenever stock or status changed, so the variants load again. */
  refreshKey: number
  onClose: () => void
  /** Archives or restores. Resolves to null when it worked (the page closes the drawer), or to what went wrong. */
  onArchive: (product: ProductListItem, archived: boolean) => Promise<string | null>
  /** Stock was saved or put back, so the list should load again. */
  onStockChanged: () => void
}

function ErrorNote({ children }: { children: string }) {
  return (
    <div role="alert" className="mt-4 flex items-start gap-3">
      <AlertIcon size={20} className="mt-0.5 shrink-0 text-danger" />
      <p className="text-sm text-fg">{children}</p>
    </div>
  )
}

/** The product drawer: read-only variants, the stock editor, and the confirm step for archiving or dropping edits. The footer follows whichever is showing. */
export function InventoryDrawer({ product, open, session, startEditing, refreshKey, onClose, onArchive, onStockChanged }: InventoryDrawerProps) {
  const toast = useToast()
  const id = product?.id
  const archived = product ? isArchived(product) : false

  const fetcher = useCallback(
    (options: RequestOptions) => (id ? (INVENTORY_SAMPLE_DATA ? sampleProductDetail : fetchProductDetail)(id, options) : IDLE),
    // A new session or refresh is a new request, though neither is read inside.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [id, session, refreshKey],
  )
  const section = useSection(fetcher)
  const variants = section.state.status === 'success' ? section.state.data.variants : null

  const [seen, setSeen] = useState(session)
  const [editing, setEditing] = useState(startEditing)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<{ title: string; why: string } | null>(null)
  // Whether AR Fitting is ticked in the editor (null until touched), and the last value saved here, which shows before the list loads again.
  const [arDraft, setArDraft] = useState<boolean | null>(null)
  const [arSaved, setArSaved] = useState<{ id: string; value: boolean } | null>(null)
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  if (seen !== session) {
    setSeen(session)
    setEditing(startEditing)
    setDraft({})
    setArDraft(null)
    setArSaved(null)
    setSaving(false)
    setSaveError(null)
    setPrompt(null)
    setArchiving(false)
    setArchiveError(null)
  }

  // The header's total follows the variants, so a saved change shows at once even when the list no longer has the row.
  const arNow = (arSaved?.id === product?.id ? arSaved?.value : product?.arReady) ?? false
  const header = product
    ? { ...product, arReady: arNow, ...(variants && { totalStock: variants.reduce((sum, v) => sum + v.stock, 0) }) }
    : product
  const changed = variants ? editedVariants(variants, draft) : []
  const arChanged = arDraft !== null && arDraft !== arNow
  const dirty = changed.length > 0 || arChanged
  const hasEmpty = changed.some((v) => parseStock(draft[v.id]) === null)
  const busy = saving || archiving
  const showEditor = editing && !archived

  // Focus: into the first stock box when editing starts, back to what asked when a confirm step is cancelled, to Edit product when editing ends.
  const bodyRef = useRef<HTMLDivElement>(null)
  const asker = useRef<string | null>(null)
  const editButton = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)
  const ready = variants !== null
  useEffect(() => {
    if (showEditor && ready) bodyRef.current?.querySelector<HTMLElement>('input[aria-label^="Stock for"]')?.focus({ preventScroll: true })
  }, [showEditor, ready, session])
  useEffect(() => {
    if (wasEditing.current && !showEditor) editButton.current?.focus()
    wasEditing.current = showEditor
  }, [showEditor])
  // The buttons that ask are replaced by the confirm step's own, so they are found again by id.
  useEffect(() => {
    if (!prompt && asker.current) document.getElementById(asker.current)?.focus()
    if (!prompt) asker.current = null
  }, [prompt])

  function ask(next: Prompt, from: string) {
    asker.current = from
    setPrompt(next)
  }

  function requestClose() {
    if (busy) return
    if (prompt) setPrompt(null)
    else if (showEditor && dirty) ask({ kind: 'discard', close: true }, DISCARD_ID)
    else onClose()
  }

  function discard() {
    setDraft({})
    setArDraft(null)
    setSaveError(null)
    setEditing(false)
    setPrompt(null)
    if (prompt?.kind === 'discard' && prompt.close) onClose()
  }

  /** Puts back the stock of `previous` and, when `previousAr` is set, AR Fitting. */
  async function undoEdit(productId: string, name: string, previous: { variantId: string; stock: number }[], previousAr?: boolean) {
    const what = previousAr === undefined ? 'stock change' : previous.length > 0 ? 'changes' : 'AR Fitting change'
    try {
      if (previousAr !== undefined) {
        await saveArReady(productId, previousAr)
        setArSaved({ id: productId, value: previousAr })
      }
      const result = previous.length > 0 ? await saveStocks(productId, previous) : { saved: [], failed: [] }
      onStockChanged()
      if (result.failed.length === 0) {
        toast.show({ kind: 'success', message: `${what[0].toUpperCase()}${what.slice(1)} undone for ${name}.` })
        return
      }
      const left = previous.filter((p) => result.failed.some((f) => f.variantId === p.variantId))
      toast.show({
        kind: 'error',
        message: `Only ${result.saved.length} of ${previous.length} sizes went back for ${name}. ${failureReason(result.failed[0].error)}`,
        action: { label: 'Retry', onClick: () => void undoEdit(productId, name, left) },
      })
    } catch (error) {
      toast.show({
        kind: 'error',
        message: `Couldn't undo the ${what} for ${name}. ${failureReason(error)}`,
        action: { label: 'Retry', onClick: () => void undoEdit(productId, name, previous, previousAr) },
      })
    }
  }

  async function save() {
    if (!product || busy || !dirty || hasEmpty) return
    const changes = changed.map((v) => ({ variantId: v.id, stock: parseStock(draft[v.id])! }))
    setSaving(true)
    setSaveError(null)
    let savingAr = false
    try {
      if (changes.length > 0) {
        const result = await saveStocks(product.id, changes)
        if (result.saved.length > 0) onStockChanged()
        if (result.failed.length > 0) {
          const title = result.saved.length > 0 ? `${result.saved.length} of ${changes.length} saved.` : `Couldn't save the stock for ${product.name}.`
          setSaveError({ title, why: `${sizes(result.failed.length)} didn't save and stay edited below. ${failureReason(result.failed[0].error)}` })
          return
        }
      }
      if (arChanged) {
        savingAr = true
        await saveArReady(product.id, arDraft!)
        setArSaved({ id: product.id, value: arDraft! })
        onStockChanged()
      }
      setEditing(false)
      setDraft({})
      setArDraft(null)
      const previous = changed.map((v) => ({ variantId: v.id, stock: v.stock }))
      toast.show({
        kind: 'success',
        message:
          changes.length === 0
            ? `AR Fitting ready turned ${arDraft ? 'on' : 'off'}`
            : arChanged
              ? 'Stock and AR Fitting updated'
              : `Stock updated for ${sizes(changes.length)}`,
        action: { label: 'Undo', onClick: () => void undoEdit(product.id, product.name, previous, arChanged ? arNow : undefined) },
      })
    } catch (error) {
      setSaveError({ title: `Couldn't save ${savingAr ? 'AR Fitting' : 'the stock'} for ${product.name}.`, why: failureReason(error) })
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(archive: boolean) {
    if (!product || busy) return
    setArchiving(true)
    setArchiveError(null)
    const message = await onArchive(product, archive)
    setArchiving(false)
    if (message) setArchiveError(message)
  }

  const edit = showEditor
    ? {
        draft,
        disabled: saving,
        onChange: (variantId: string, text: string) => setDraft((old) => ({ ...old, [variantId]: text })),
        onSetSoldOut: (stock: number) =>
          setDraft((old) => ({ ...old, ...Object.fromEntries((variants ?? []).filter((v) => v.stock <= 0).map((v) => [v.id, String(stock)])) })),
        // The API has no arReady field to save yet, so the checkbox only exists on the sample catalogue.
        ar: INVENTORY_SAMPLE_DATA ? { checked: arDraft ?? arNow, onChange: (checked: boolean) => !saving && setArDraft(checked) } : undefined,
      }
    : undefined

  const row = 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'
  let footer = null
  if (product && prompt) {
    const archive = prompt.kind === 'archive'
    footer = (
      <div className={row}>
        <button type="button" autoFocus disabled={archiving} onClick={() => setPrompt(null)} className={PRIMARY_BUTTON}>
          Cancel
        </button>
        <button type="button" disabled={archiving} onClick={() => (archive ? void changeStatus(true) : discard())} className={SECONDARY_BUTTON}>
          {archive ? (archiving ? 'Archiving…' : 'Archive product') : 'Discard changes'}
        </button>
      </div>
    )
  } else if (product && archived) {
    footer = (
      <div className={row}>
        <button type="button" disabled={archiving} onClick={() => void changeStatus(false)} className={PRIMARY_BUTTON}>
          {archiving && <SpinnerIcon />}
          {archiving ? 'Restoring…' : 'Restore product'}
        </button>
      </div>
    )
  } else if (product && showEditor) {
    footer = (
      <div className={row}>
        <button
          type="button"
          id={DISCARD_ID}
          disabled={saving}
          onClick={() => (dirty ? ask({ kind: 'discard', close: false }, DISCARD_ID) : discard())}
          className={SECONDARY_BUTTON}
        >
          Discard
        </button>
        <button type="button" disabled={saving || !dirty || hasEmpty} onClick={() => void save()} className={PRIMARY_BUTTON}>
          {saving && <SpinnerIcon />}
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    )
  } else if (product) {
    footer = (
      <div className={row}>
        <button type="button" id={ARCHIVE_ID} onClick={() => ask({ kind: 'archive' }, ARCHIVE_ID)} className={SECONDARY_BUTTON}>
          Archive product
        </button>
        <button
          ref={editButton}
          type="button"
          disabled={section.state.status === 'error' || (variants !== null && variants.length === 0)}
          onClick={() => setEditing(true)}
          className={PRIMARY_BUTTON}
        >
          Edit product
        </button>
      </div>
    )
  }

  const notice = saveError && (
    <div role="alert" className="mt-4 flex items-start gap-3 rounded-xl border border-line bg-canvas p-3">
      <AlertIcon size={20} className="mt-0.5 shrink-0 text-danger" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-fg">{saveError.title}</p>
        <p className="mt-1 text-sm text-fg-muted">{saveError.why}</p>
        {dirty && !hasEmpty && (
          <button type="button" disabled={saving} onClick={() => void save()} className={`${SECONDARY_BUTTON} mt-3`}>
            Retry
          </button>
        )}
      </div>
    </div>
  )

  return (
    <Modal variant="sheet" open={open} onClose={requestClose} title={prompt ? 'Are you sure?' : (product?.name ?? '')} footer={footer} bodyRef={bodyRef}>
      {product && prompt ? (
        <div className="pb-5">
          <p className="text-base leading-relaxed text-fg-muted">
            {prompt.kind === 'archive'
              ? `${product.name} will be hidden from the shop and from Active inventory. You can restore it from the Archived tab.`
              : changed.length === 0
                ? `Your change to AR Fitting for ${product.name} will be lost.`
                : `Your changes to ${sizes(changed.length)} of ${product.name}${arChanged ? ' and to AR Fitting' : ''} will be lost.`}
          </p>
          {archiveError && prompt.kind === 'archive' && <ErrorNote>{archiveError}</ErrorNote>}
        </div>
      ) : (
        open &&
        product && (
          <>
            <ProductDetail product={header ?? product} section={section} edit={edit} notice={notice} />
            {archiveError && archived && <ErrorNote>{archiveError}</ErrorNote>}
          </>
        )
      )}
    </Modal>
  )
}
