import { useRef, useState } from 'react'
import { useCurrentUser } from '../../../hooks/useCurrentUser'
import { useRefunds } from '../../../hooks/useRefunds'
import { approveRefund, type RefundRequest, type RefundStatus } from '../../../service/refunds'
import { formatPeso } from '../../../utils/format'
import { SegmentedTabs } from '../../ui/SegmentedTabs'
import { STAFF_SECTION } from '../../staff/StaffSkeleton'
import { useToast } from '../../toast/useToast'
import { ConfirmDialog } from '../users/ConfirmDialog'
import { RefundDetailSheet } from './RefundDetailSheet'
import { RefundsTable } from './RefundsTable'
import { RefundsToolbar } from './RefundsToolbar'

const STATUSES: readonly { value: RefundStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

const refunds = (count: number) => `${count} ${count === 1 ? 'refund' : 'refunds'}`

/** Everything about the refund requests: their filters, table, the detail sheet, the pending ones ticked for a bulk approval and its confirmation. */
export function RefundsList() {
  const toast = useToast()
  const admin = useCurrentUser()?.name ?? 'Admin'
  const list = useRefunds()
  const [sheet, setSheet] = useState<{ request: RefundRequest | null; session: number; open: boolean }>({ request: null, session: 0, open: false })
  // The ticks belong to the view they were made in: another tab, search, sort or page starts again with none.
  const view = [list.status, list.text, list.sorted.sort, list.sorted.dir, list.page, list.per].join('|')
  const [ticked, setTicked] = useState<{ view: string; ids: string[] }>({ view, ids: [] })
  // The checkboxes are hidden until the admin chooses to select requests.
  const [selecting, setSelecting] = useState(false)
  // Stays set while the dialog closes, so its text does not change as it fades out.
  const [bulk, setBulk] = useState<RefundRequest[]>([])
  const [asking, setAsking] = useState(false)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)

  const pendingRows = (list.result?.data ?? []).filter((row) => row.status === 'pending')
  // Adjusted while rendering, so a view that was left and comes back is not still ticked.
  if (ticked.view !== view) setTicked({ view, ids: [] })
  const current = ticked.view === view ? ticked.ids : []
  const selected = pendingRows.filter((row) => current.includes(row.id))

  const openSheet = (request: RefundRequest) => setSheet((old) => ({ request, session: old.session + 1, open: true }))
  const toggle = (id: string) => setTicked({ view, ids: current.includes(id) ? current.filter((x) => x !== id) : [...current, id] })
  const toggleAll = (ids: string[]) => setTicked({ view, ids: ids.every((id) => current.includes(id)) ? [] : ids })

  async function approveAll(rows: RefundRequest[]) {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    try {
      const results = await Promise.allSettled(rows.map((row) => approveRefund(row.id, { amount: row.amount, decidedBy: admin })))
      const isConflict = (n: number) => {
        const result = results[n]
        return result.status === 'rejected' && (result.reason as { kind?: string }).kind === 'conflict'
      }
      const decidedByOther = rows.filter((_, n) => isConflict(n))
      const failed = rows.filter((_, n) => results[n].status === 'rejected' && !isConflict(n))
      setAsking(false)
      setTicked({ view, ids: failed.map((row) => row.id) })
      if (failed.length === 0 && decidedByOther.length === 0) {
        toast.show({ kind: 'success', message: `${refunds(rows.length)} approved: ${formatPeso(rows.reduce((sum, row) => sum + row.amount, 0))}` })
      } else {
        // A conflict is not a connection problem: those requests were decided by someone else (and the list has loaded again), so only the others can be retried.
        const head = `${rows.length - failed.length - decidedByOther.length} of ${rows.length} approved`
        const decided = `${decidedByOther.length} already decided by someone else, the list is refreshed`
        const broken = `${failed.length} failed. The failed requests are still pending and ticked. Check your connection, then retry.`
        toast.show({
          kind: 'error',
          message: decidedByOther.length === 0 ? `${head}, ${broken}` : failed.length === 0 ? `${head}, ${decided}.` : `${head}, ${decided}. ${broken}`,
          action:
            failed.length === 0
              ? undefined
              : {
                  label: 'Retry',
                  onClick: () => {
                    setBulk(failed)
                    setAsking(true)
                  },
                },
        })
      }
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  const total = bulk.reduce((sum, row) => sum + row.amount, 0)

  return (
    <section aria-labelledby="refunds-list" className={`${STAFF_SECTION} scroll-mt-14`}>
      <h2 id="refunds-list" className="sr-only">
        Refund requests
      </h2>
      <div className="mb-3">
        <SegmentedTabs label="Request status" name="refund-status" options={STATUSES} value={list.status || 'all'} onChange={(value) => list.setStatus(value === 'all' ? '' : value)} />
      </div>
      <RefundsToolbar
        text={list.text}
        onText={list.setText}
        per={list.per}
        onPer={list.setPer}
        selecting={selecting}
        onSelecting={(on) => {
          setSelecting(on)
          if (!on) setTicked({ view, ids: [] })
        }}
        selected={selected.length}
        onApproveSelected={() => {
          setBulk(selected)
          setAsking(true)
        }}
      />
      <RefundsTable list={list} selecting={selecting} selected={selected.map((row) => row.id)} onToggle={toggle} onToggleAll={toggleAll} onOpen={openSheet} />
      {sheet.request && <RefundDetailSheet key={sheet.session} request={sheet.request} open={sheet.open} onClose={() => setSheet((old) => ({ ...old, open: false }))} />}
      <ConfirmDialog
        open={asking}
        title={`Approve ${refunds(bulk.length)} totalling ${formatPeso(total)}?`}
        confirmLabel="Approve refunds"
        pending={pending}
        onConfirm={() => void approveAll(bulk)}
        onClose={() => setAsking(false)}
      >
        Each customer is refunded the full amount they asked for. This can't be changed afterwards.
      </ConfirmDialog>
    </section>
  )
}
