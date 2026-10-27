import { useCallback, useEffect, useRef, useState } from 'react'
import { useSection } from '../../../hooks/useSection'
import { fetchProductDetail, type ProductDetailFields, type ProductListItem, type ProductVariant } from '../../../service/fetchProductList'
import { failureReason, manageFailureReason, removeVariant, saveStocks } from '../../../service/inventoryActions'
import type { RequestOptions } from '../../../service/simulateRequest'
import { editedVariants, parseStock } from '../../../utils/stockEdit'
import { AlertIcon, SpinnerIcon } from '../../form/icons'
import { useToast } from '../../toast/useToast'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { Modal } from '../../ui/Modal'
import { isArchived } from '../../../utils/inventoryQuery'
import { ADD_VARIANT_ID } from './ProductDetail'
import { ProductDetail } from './ProductDetail'
import { variantLabel } from './InventoryParts'

/** Stands in for the detail request while no product is selected. It never answers. */
const IDLE = new Promise<{ variants: ProductVariant[]; product?: ProductDetailFields }>(() => {})

const sizes = (n: number) => `${n} ${n === 1 ? 'size' : 'sizes'}`

const DISCARD_ID = 'inventory-discard'
const ARCHIVE_ID = 'inventory-archive'
const DELETE_ID = 'inventory-delete'

type Prompt = { kind: 'archive' } | { kind: 'delete' } | { kind: 'delete-variant'; variant: ProductVariant } | { kind: 'discard'; close: boolean }

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
  /** Deletes the product for good. Resolves to null when it worked (the page closes the drawer), or to what went wrong. */
  onDelete: (product: ProductListItem) => Promise<string | null>
  /** The page closes the drawer and opens the Edit details form. */
  onEditDetails: (product: ProductListItem, fields: ProductDetailFields) => void
  /** The page closes the drawer and opens the variant form, and brings the drawer back when that closes. */
  onAddVariant: () => void
  onEditVariant: (variant: ProductVariant) => void
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
export function InventoryDrawer({
  product,
  open,
  session,
  startEditing,
  refreshKey,
  onClose,
  onArchive,
  onDelete,
  onEditDetails,
  onAddVariant,
  onEditVariant,
  onStockChanged,
}: InventoryDrawerProps) {
  const toast = useToast()
  const id = product?.id
  const archived = product ? isArchived(product) : false

  // A closing drawer keeps what it shows: a refresh that arrives with the close (a deleted product) is not fetched.
  const [loadedRefresh, setLoadedRefresh] = useState(refreshKey)
  if (open && loadedRefresh !== refreshKey) setLoadedRefresh(refreshKey)

  const fetcher = useCallback(
    (options: RequestOptions) => (id ? fetchProductDetail(id, options) : IDLE),
    // A new session or refresh is a new request, though neither is read inside.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [id, session, loadedRefresh],
  )
  const section = useSection(fetcher)
  const variants = section.state.status === 'success' ? section.state.data.variants : null
  const fields = section.state.status === 'success' ? section.state.data.product : undefined

  const [seen, setSeen] = useState(session)
  const [editing, setEditing] = useState(startEditing)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<{ title: string; why: string } | null>(null)
  // The AR Fitting box is inert (the API cannot store it): it only shows what was ticked, and a change to it is not an edit to save.
  const [arDraft, setArDraft] = useState<boolean | null>(null)
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  if (seen !== session) {
    setSeen(session)
    setEditing(startEditing)
    setDraft({})
    setArDraft(null)
    setSaving(false)
    setSaveError(null)
    setPrompt(null)
    setArchiving(false)
    setArchiveError(null)
    setRemoving(false)
    setRemoveError(null)
  }

  // The header's total and price follow the variants, so a saved change shows at once even when the list no longer has the row.
  const header = product
    ? {
        ...product,
        ...(variants && {
          totalStock: variants.reduce((sum, v) => sum + v.stock, 0),
          ...(variants.length > 0 && { minPrice: Math.min(...variants.map((v) => v.price)), maxPrice: Math.max(...variants.map((v) => v.price)) }),
        }),
      }
    : product
  const changed = variants ? editedVariants(variants, draft) : []
  const dirty = changed.length > 0
  const hasEmpty = changed.some((v) => parseStock(draft[v.id]) === null)
  const busy = saving || archiving || removing
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
  // After a variant is deleted the variants load again, so the button is there only once they are back.
  useEffect(() => {
    if (prompt || !asker.current) return
    const target = document.getElementById(asker.current)
    if (!target) return
    target.focus()
    asker.current = null
  }, [prompt, ready])

  function ask(next: Prompt, from: string) {
    asker.current = from
    setRemoveError(null)
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
    setSaveError(null)
    setEditing(false)
    setPrompt(null)
    if (prompt?.kind === 'discard' && prompt.close) onClose()
  }

  /** Puts back the stock of `previous`. */
  async function undoEdit(productId: string, name: string, previous: { variantId: string; stock: number }[]) {
    try {
      const result = await saveStocks(productId, previous)
      onStockChanged()
      if (result.failed.length === 0) {
        toast.show({ kind: 'success', message: `Stock change undone for ${name}.` })
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
        message: `Couldn't undo the stock change for ${name}. ${failureReason(error)}`,
        action: { label: 'Retry', onClick: () => void undoEdit(productId, name, previous) },
      })
    }
  }

  async function save() {
    if (!product || busy || !dirty || hasEmpty) return
    const changes = changed.map((v) => ({ variantId: v.id, stock: parseStock(draft[v.id])! }))
    setSaving(true)
    setSaveError(null)
    try {
      const result = await saveStocks(product.id, changes)
      if (result.saved.length > 0) onStockChanged()
      if (result.failed.length > 0) {
        const title = result.saved.length > 0 ? `${result.saved.length} of ${changes.length} saved.` : `Couldn't save the stock for ${product.name}.`
        setSaveError({ title, why: `${sizes(result.failed.length)} didn't save and stay edited below. ${failureReason(result.failed[0].error)}` })
        return
      }
      setEditing(false)
      setDraft({})
      const previous = changed.map((v) => ({ variantId: v.id, stock: v.stock }))
      toast.show({
        kind: 'success',
        message: `Stock updated for ${sizes(changes.length)}`,
        action: { label: 'Undo', onClick: () => void undoEdit(product.id, product.name, previous) },
      })
    } catch (error) {
      setSaveError({ title: `Couldn't save the stock for ${product.name}.`, why: failureReason(error) })
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

  /** Deleting the product is the page's request; deleting a variant is the drawer's own, and refreshes the variants. */
  async function remove(target: Prompt) {
    if (!product || busy) return
    setRemoving(true)
    setRemoveError(null)
    if (target.kind === 'delete') {
      const message = await onDelete(product)
      setRemoving(false)
      if (message) setRemoveError(message)
      return
    }
    if (target.kind !== 'delete-variant') return
    const { variant } = target
    try {
      await removeVariant(product.id, variant.id)
    } catch (error) {
      // Already gone is what was asked for.
      if ((error as { kind?: string }).kind !== 'not-found') {
        setRemoving(false)
        setRemoveError(`Couldn't delete ${variantLabel(variant)}. ${manageFailureReason(error, 'delete-variant')}`)
        return
      }
    }
    setRemoving(false)
    setPrompt(null)
    onStockChanged()
    toast.show({ kind: 'success', message: 'Variant deleted' })
  }

  const manage =
    product && !showEditor && !archived
      ? {
          onEditDetails: fields ? () => onEditDetails(product, fields) : undefined,
          onAddVariant,
          onEditVariant,
          onDeleteVariant: (variant: ProductVariant) => ask({ kind: 'delete-variant', variant }, ADD_VARIANT_ID),
        }
      : undefined

  const edit = showEditor
    ? {
        draft,
        disabled: saving,
        onChange: (variantId: string, text: string) => setDraft((old) => ({ ...old, [variantId]: text })),
        ar: { checked: arDraft ?? product?.arReady ?? false, onChange: (checked: boolean) => !saving && setArDraft(checked) },
        onSetSoldOut: (stock: number) =>
          setDraft((old) => ({ ...old, ...Object.fromEntries((variants ?? []).filter((v) => v.stock <= 0).map((v) => [v.id, String(stock)])) })),
      }
    : undefined

  const row = 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'
  let footer = null
  if (product && prompt) {
    const wait = archiving || removing
    const confirm = {
      archive: { label: 'Archive product', busy: 'Archiving…', run: () => void changeStatus(true) },
      delete: { label: 'Delete Product', busy: 'Deleting…', run: () => void remove(prompt) },
      'delete-variant': { label: 'Delete Variant', busy: 'Deleting…', run: () => void remove(prompt) },
      discard: { label: 'Discard changes', busy: 'Discard changes', run: discard },
    }[prompt.kind]
    footer = (
      // Keyed so Cancel mounts fresh (and takes focus) whichever footer button asked.
      <div key="prompt" className={row}>
        <button type="button" autoFocus disabled={wait} onClick={() => setPrompt(null)} className={PRIMARY_BUTTON}>
          Cancel
        </button>
        <button type="button" disabled={wait} onClick={confirm.run} className={SECONDARY_BUTTON}>
          {wait && <SpinnerIcon />}
          {wait ? confirm.busy : confirm.label}
        </button>
      </div>
    )
  } else if (product && archived) {
    footer = (
      <div className={`${row} sm:flex-wrap`}>
        <button type="button" id={DELETE_ID} onClick={() => ask({ kind: 'delete' }, DELETE_ID)} className={SECONDARY_BUTTON}>
          Delete product
        </button>
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
      <div className={`${row} sm:flex-wrap`}>
        <button type="button" id={DELETE_ID} onClick={() => ask({ kind: 'delete' }, DELETE_ID)} className={SECONDARY_BUTTON}>
          Delete product
        </button>
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
              : prompt.kind === 'delete'
                ? `${product.name} and its ${variants ? `${variants.length} ${variants.length === 1 ? 'variant' : 'variants'}` : 'variants'}, images and AR measurements will be permanently deleted, and removed from shoppers' carts. This can't be undone.${archived ? '' : ' To hide it from the shop instead, archive it.'}`
                : prompt.kind === 'delete-variant'
                  ? `${variantLabel(prompt.variant)} (SKU ${prompt.variant.sku}) will be permanently deleted, and removed from shoppers' carts. This can't be undone.${variants?.length === 1 ? ` It is the last variant, so ${product.name} will have no price or stock.` : ''}`
                  : `Your changes to ${sizes(changed.length)} of ${product.name} will be lost.`}
          </p>
          {archiveError && prompt.kind === 'archive' && <ErrorNote>{archiveError}</ErrorNote>}
          {removeError && (prompt.kind === 'delete' || prompt.kind === 'delete-variant') && <ErrorNote>{removeError}</ErrorNote>}
        </div>
      ) : (
        open &&
        product && (
          <>
            <ProductDetail product={header ?? product} section={section} edit={edit} manage={manage} notice={notice} />
            {archiveError && archived && <ErrorNote>{archiveError}</ErrorNote>}
          </>
        )
      )}
    </Modal>
  )
}
