import { useState } from 'react'
import { useRefunds } from '../../../hooks/useRefunds'
import type { Refund, RefundStatus } from '../../../service/refunds'
import { SegmentedTabs } from '../../ui/SegmentedTabs'
import { STAFF_SECTION } from '../../staff/StaffSkeleton'
import { useToast } from '../../toast/useToast'
import { RefundDetailSheet } from './RefundDetailSheet'
import { RefundsTable } from './RefundsTable'
import { RefundsToolbar } from './RefundsToolbar'

const STATUSES: readonly { value: RefundStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'REQUESTED', label: 'Requested' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'REQUIRES_MANUAL_ACTION', label: 'Needs action' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'SUCCEEDED', label: 'Refunded' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

/** Everything about the refunds: their filters, table and the detail sheet. */
export function RefundsList() {
  const toast = useToast()
  const list = useRefunds()
  const [sheet, setSheet] = useState<{ refund: Refund | null; session: number; open: boolean }>({ refund: null, session: 0, open: false })

  const openSheet = (refund: Refund) => setSheet((old) => ({ refund, session: old.session + 1, open: true }))

  return (
    <section aria-labelledby="refunds-list" className={`${STAFF_SECTION} scroll-mt-14`}>
      <h2 id="refunds-list" className="sr-only">
        Refunds
      </h2>
      <div className="mb-3">
        <SegmentedTabs label="Refund status" name="refund-status" options={STATUSES} value={list.status || 'all'} onChange={(value) => list.setStatus(value === 'all' ? '' : value)} />
      </div>
      <RefundsToolbar text={list.text} onText={list.setText} per={list.per} onPer={list.setPer} />
      <RefundsTable list={list} onOpen={openSheet} />
      {sheet.refund && (
        <RefundDetailSheet
          key={sheet.session}
          refund={sheet.refund}
          open={sheet.open}
          onClose={() => setSheet((old) => ({ ...old, open: false }))}
          onGone={() => {
            setSheet((old) => ({ ...old, open: false }))
            toast.show({ kind: 'error', message: 'That refund no longer exists, so the list was refreshed.' })
            list.retry()
          }}
        />
      )}
    </section>
  )
}
