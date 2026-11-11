import { useEffect, useRef, useState } from 'react'
import { useHelpAnswers } from '../../../hooks/useHelpAnswers'
import { deleteHelpAnswer, moveHelpAnswer, type HelpAnswer } from '../../../service/helpAnswers'
import { STAFF_SECTION } from '../../staff/StaffSkeleton'
import { useToast } from '../../toast/useToast'
import { ConfirmDialog } from '../users/ConfirmDialog'
import { HelpAnswerSheet } from './HelpAnswerSheet'
import { HelpAnswersTable } from './HelpAnswersTable'
import { HelpAnswersToolbar } from './HelpAnswersToolbar'

/** Everything about the help answers list: its filters, table, the add and edit sheet, reordering and the delete confirmation. */
export function HelpAnswersList() {
  const toast = useToast()
  const list = useHelpAnswers()
  const [sheet, setSheet] = useState<{ answer: HelpAnswer | null; session: number; open: boolean }>({ answer: null, session: 0, open: false })
  // Stays set while the dialog closes, so its text does not change as it fades out.
  const [confirm, setConfirm] = useState<HelpAnswer | null>(null)
  const [asking, setAsking] = useState(false)
  const [pending, setPending] = useState(false)
  const [moved, setMoved] = useState('')
  // The move button to focus once the reordered list has loaded: the row it sat in has moved.
  const refocus = useRef<string | null>(null)

  useEffect(() => {
    if (!refocus.current || list.stale) return
    const buttons = document.querySelectorAll<HTMLElement>(`[data-move="${refocus.current}"]`)
    // The table and the cards are both in the page; one of them is hidden.
    Array.from(buttons).find((button) => button.offsetParent !== null)?.focus()
    refocus.current = null
  }, [list.result, list.stale])

  const openSheet = (answer: HelpAnswer | null) => setSheet((old) => ({ answer, session: old.session + 1, open: true }))
  const ask = (answer: HelpAnswer) => {
    setConfirm(answer)
    setAsking(true)
  }

  async function remove(answer: HelpAnswer) {
    setPending(true)
    try {
      await deleteHelpAnswer(answer.id)
      setAsking(false)
      toast.show({ kind: 'success', message: `"${answer.question}" deleted` })
    } catch {
      setAsking(false)
      toast.show({
        kind: 'error',
        message: `Couldn't delete "${answer.question}". The request failed before anything changed, so it is still in the list. Check your connection, then retry.`,
        action: { label: 'Retry', onClick: () => setAsking(true) },
      })
    } finally {
      setPending(false)
    }
  }

  async function move(answer: HelpAnswer, direction: 'up' | 'down') {
    refocus.current = `${answer.id}:${direction}`
    try {
      const position = await moveHelpAnswer(answer.id, direction)
      setMoved(`Moved to position ${position}`)
    } catch {
      refocus.current = null
      toast.show({
        kind: 'error',
        message: `Couldn't move "${answer.question}". The request failed before anything changed, so the order is the same. Check your connection, then retry.`,
        action: { label: 'Retry', onClick: () => void move(answer, direction) },
      })
    }
  }

  return (
    <section aria-labelledby="help-answers-list" className={`${STAFF_SECTION} scroll-mt-14`}>
      <h2 id="help-answers-list" className="sr-only">
        Help questions
      </h2>
      <HelpAnswersToolbar text={list.text} onText={list.setText} category={list.category} onCategory={list.setCategory} per={list.per} onPer={list.setPer} onCreate={() => openSheet(null)} />
      <p role="status" className="sr-only">
        {moved}
      </p>
      <HelpAnswersTable list={list} onCreate={() => openSheet(null)} onEdit={openSheet} onDelete={ask} onMove={(row, direction) => void move(row, direction)} />
      <HelpAnswerSheet key={sheet.session} open={sheet.open} onClose={() => setSheet((old) => ({ ...old, open: false }))} answer={sheet.answer} />
      <ConfirmDialog open={asking} title={`Delete "${confirm?.question ?? ''}"?`} confirmLabel="Delete question" pending={pending} onConfirm={() => confirm && void remove(confirm)} onClose={() => setAsking(false)}>
        Customers stop seeing this answer right away. This can&apos;t be undone.
      </ConfirmDialog>
    </section>
  )
}
