import { useState } from 'react'
import { usePromotions } from '../../../hooks/usePromotions'
import { deletePromotion, endPromotion, type PromoStatus, type PromotionRow } from '../../../service/promotions'
import { SegmentedTabs } from '../../ui/SegmentedTabs'
import { STAFF_SECTION } from '../../staff/StaffSkeleton'
import { useToast } from '../../toast/useToast'
import { ConfirmDialog } from '../users/ConfirmDialog'
import { PromotionSheet } from './PromotionSheet'
import { PromotionsTable } from './PromotionsTable'
import { PromotionsToolbar } from './PromotionsToolbar'

const STATUSES: readonly { value: PromoStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'ended', label: 'Ended' },
]

type Confirm = { kind: 'end' | 'delete'; promotion: PromotionRow }

/** Everything about the promotions list: its filters, table, the create and edit sheet, and the end and delete confirmations. */
export function PromotionsList() {
  const toast = useToast()
  const list = usePromotions()
  const [sheet, setSheet] = useState<{ promotion: PromotionRow | null; session: number; open: boolean }>({ promotion: null, session: 0, open: false })
  // Stays set while the dialog closes, so its text does not change as it fades out.
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [asking, setAsking] = useState(false)
  const [pending, setPending] = useState(false)

  const openSheet = (promotion: PromotionRow | null) => setSheet((old) => ({ promotion, session: old.session + 1, open: true }))
  const ask = (kind: Confirm['kind'], promotion: PromotionRow) => {
    setConfirm({ kind, promotion })
    setAsking(true)
  }

  async function run({ kind, promotion }: Confirm) {
    setPending(true)
    try {
      if (kind === 'end') await endPromotion(promotion.id)
      else await deletePromotion(promotion.id)
      setAsking(false)
      toast.show({ kind: 'success', message: kind === 'end' ? `"${promotion.name}" ended` : `"${promotion.name}" deleted` })
    } catch {
      setAsking(false)
      toast.show({
        kind: 'error',
        message: `Couldn't ${kind === 'end' ? 'end' : 'delete'} "${promotion.name}". The request failed before anything changed, so it is still ${kind === 'end' ? 'running' : 'in the list'}. Check your connection, then retry.`,
        action: { label: 'Retry', onClick: () => setAsking(true) },
      })
    } finally {
      setPending(false)
    }
  }

  async function copy({ code }: PromotionRow) {
    try {
      await navigator.clipboard.writeText(code)
      toast.show({ kind: 'success', message: `Copied ${code}` })
    } catch {
      toast.show({ kind: 'error', message: `Couldn't copy ${code}. The browser blocked access to the clipboard. Select the code and copy it by hand.` })
    }
  }

  const ending = confirm?.kind === 'end'
  const name = confirm?.promotion.name ?? ''
  const code = confirm?.promotion.code ?? ''

  return (
    <section aria-labelledby="promotions-list" className={`${STAFF_SECTION} scroll-mt-14`}>
      <h2 id="promotions-list" className="sr-only">
        Promotions
      </h2>
      <div className="mb-3">
        <SegmentedTabs label="Promotion status" name="promo-status" options={STATUSES} value={list.status || 'all'} onChange={(value) => list.setStatus(value === 'all' ? '' : value)} />
      </div>
      <PromotionsToolbar text={list.text} onText={list.setText} per={list.per} onPer={list.setPer} onCreate={() => openSheet(null)} />
      <PromotionsTable list={list} onCreate={() => openSheet(null)} onEdit={openSheet} onEnd={(row) => ask('end', row)} onDelete={(row) => ask('delete', row)} onCopy={(row) => void copy(row)} />
      <PromotionSheet key={sheet.session} open={sheet.open} onClose={() => setSheet((old) => ({ ...old, open: false }))} promotion={sheet.promotion} />
      <ConfirmDialog
        open={asking}
        title={ending ? `End "${name}" now?` : `Delete "${name}"?`}
        confirmLabel={ending ? 'End promotion' : 'Delete promotion'}
        pending={pending}
        onConfirm={() => confirm && void run(confirm)}
        onClose={() => setAsking(false)}
      >
        {ending
          ? `Shoppers can no longer use code ${code}. Redemptions so far are kept. This can't be undone.`
          : `The code ${code} stops working${confirm?.promotion.status === 'active' ? ' right away, even though the sale is running' : ''}, and its redemption history is deleted. This can't be undone.`}
      </ConfirmDialog>
    </section>
  )
}
