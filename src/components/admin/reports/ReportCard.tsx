import { useState, type ReactNode } from 'react'
import { useCurrentUser } from '../../../hooks/useCurrentUser'
import { manilaToday } from '../../../utils/period'
import { downloadFile } from '../../../utils/downloadFile'
import type { ReportDoc } from '../../../utils/reportTypes'
import { DownloadIcon, SpinnerIcon } from '../../form/icons'
import { SECONDARY_BUTTON_SM } from '../../ui/buttonStyles'
import { useToast } from '../../toast/useToast'
import { STAFF_SECTION } from '../../staff/StaffSkeleton'

type Format = 'xlsx' | 'pdf'

interface ReportCardProps {
  title: string
  description: string
  /** Period controls, when the report has them. */
  controls?: ReactNode
  /** The figures and chart the file opens with, drawn above the download buttons. */
  preview?: ReactNode
  /** What the file holds, one short item each. */
  includes: string[]
  /** Reads the figures and shapes them into the report. A failure here makes no file. */
  load: () => Promise<ReportDoc>
}

/** One report: what it holds, its filters, and Download Excel / Download PDF. Each file is made on demand, so nothing is fetched until a button is pressed. */
export function ReportCard({ title, description, controls, preview, includes, load }: ReportCardProps) {
  const user = useCurrentUser()
  const toast = useToast()
  const [busy, setBusy] = useState<Format | null>(null)

  async function download(format: Format) {
    if (busy) return
    setBusy(format)
    try {
      const doc = await load()
      const meta = { exportedBy: { name: user?.name, email: user?.email }, exportedAt: new Date() }
      // Both writers load on demand: ExcelJS and jsPDF are large and only a download needs them.
      if (format === 'xlsx') {
        const [{ buildReportXlsx }, { XLSX_MIME }] = await Promise.all([import('../../../utils/reportXlsx'), import('../../../utils/transactionsXlsx')])
        const { bytes } = await buildReportXlsx(doc, meta)
        downloadFile(new Blob([bytes], { type: XLSX_MIME }), `${doc.filename}-${manilaToday().date}.xlsx`)
      } else {
        const { buildReportPdf } = await import('../../../utils/reportPdf')
        downloadFile(await buildReportPdf(doc, meta), `${doc.filename}-${manilaToday().date}.pdf`)
      }
      toast.show({ kind: 'success', message: `${doc.title} downloaded as ${format === 'xlsx' ? 'Excel' : 'PDF'}` })
    } catch {
      toast.show({
        kind: 'error',
        message: `Couldn't make the ${title.toLowerCase()}. Its figures could not be loaded, so no file was made. Check your connection, then retry.`,
        action: { label: 'Retry', onClick: () => void download(format) },
      })
    } finally {
      setBusy(null)
    }
  }

  const id = title.toLowerCase().replace(/\s+/g, '-')
  return (
    <section aria-labelledby={`${id}-title`} className={`${STAFF_SECTION} grid content-start gap-4`}>
      <div>
        <h2 id={`${id}-title`} className="display text-xl text-fg">
          {title}
        </h2>
        <p className="mt-1 text-sm text-fg-muted">{description}</p>
      </div>
      {controls && <div className="flex flex-wrap items-center gap-2">{controls}</div>}
      {preview}
      <div className="border-t border-line pt-3">
        <p className="text-xs font-semibold tracking-wide text-fg-muted uppercase">In the file</p>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {includes.map((item) => (
            <li key={item} className="rounded-xl bg-fg/5 px-2.5 py-1 text-xs text-fg">
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        <button type="button" disabled={busy !== null} onClick={() => void download('xlsx')} className={SECONDARY_BUTTON_SM}>
          {busy === 'xlsx' ? <SpinnerIcon /> : <DownloadIcon />}
          {busy === 'xlsx' ? 'Preparing Excel…' : 'Download Excel'}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void download('pdf')} className={SECONDARY_BUTTON_SM}>
          {busy === 'pdf' ? <SpinnerIcon /> : <DownloadIcon />}
          {busy === 'pdf' ? 'Preparing PDF…' : 'Download PDF'}
        </button>
      </div>
    </section>
  )
}
