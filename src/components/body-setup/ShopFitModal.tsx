import { KRAL_PRIMARY, KRAL_SECONDARY } from '../shop/shopControls'
import { Modal } from '../ui/Modal'

interface ShopFitModalProps {
  open: boolean
  /** The recommendation inputs the saved profile still lacks ("weight", "body build"); empty when it can be ranked. */
  missing: string[]
  /** Opens the shop ranked by fit. */
  onShop: () => void
  /** Goes back to the step that holds the first missing input. */
  onAdd: () => void
  /** Leaves without shopping. */
  onClose: () => void
}

/** Offered after measurements are saved: straight to the pieces that fit, or what is still needed before they can be ranked. */
export function ShopFitModal({ open, missing, onShop, onAdd, onClose }: ShopFitModalProps) {
  const ready = missing.length === 0
  const list = missing.join(' and ')
  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="kral"
      size="sm"
      title={ready ? 'See what fits you' : 'One more detail'}
      footer={
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} className={KRAL_SECONDARY}>
            Not now
          </button>
          <button type="button" onClick={ready ? onShop : onAdd} className={KRAL_PRIMARY}>
            {ready ? 'Shop my sizes' : `Add ${list}`}
          </button>
        </div>
      }
    >
      <p className="font-kral-mono text-base leading-relaxed text-kral-muted">
        {ready
          ? 'Your measurements are saved. Open the shop with only the pieces ranked by how well they fit you, each with your best size.'
          : `Size recommendations need your ${list}. Add ${missing.length > 1 ? 'them' : 'it'} to see which pieces and sizes fit you.`}
      </p>
    </Modal>
  )
}
