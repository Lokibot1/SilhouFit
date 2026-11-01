import { useState, type FormEvent } from 'react'
import { addCustomSizing, updateCustomSizing, useCustomSizings, type CustomSizing } from '../../../service/customSizings'
import { buildCustomSizing, draftFromSizing, newSizingDraft, validateSizingDraft } from '../../../utils/customSizing'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { Modal } from '../../ui/Modal'
import { CustomSizingEditor } from './CustomSizingEditor'

const FORM_ID = 'custom-sizing-form'

interface CustomSizingSheetProps {
  /** The sizing being edited; left out to add one. */
  sizing?: CustomSizing
  /** The category the page is showing, which the sizing belongs to. */
  category: string
  /** The sizing was saved. The page closes the sheet and shows the toast. */
  onSaved: (saved: CustomSizing) => void
  onClose: () => void
}

/** Add a custom sizing to a category, or edit one: a name and its own sizes with measurements. Mount it fresh each time it opens. */
export function CustomSizingSheet({ sizing, category, onSaved, onClose }: CustomSizingSheetProps) {
  const editing = sizing !== undefined
  const taken = useCustomSizings(category)
    .filter((s) => s.id !== sizing?.id)
    .map((s) => s.name)
  const [draft, setDraft] = useState(() => (sizing ? draftFromSizing(sizing) : newSizingDraft()))
  const [initial] = useState(() => JSON.stringify(draft))
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set())
  const [attempted, setAttempted] = useState(false)
  const [discarding, setDiscarding] = useState(false)

  const errors = validateSizingDraft(draft, category, taken)
  const error = (key: string) => (attempted || touched.has(key) ? errors[key] : undefined)
  const touch = (key: string) => setTouched((old) => new Set(old).add(key))
  const dirty = JSON.stringify(draft) !== initial

  function submit(event?: FormEvent) {
    event?.preventDefault()
    setAttempted(true)
    const first = Object.keys(errors)[0]
    if (first) {
      document.getElementById(`cs-${first}`)?.focus()
      return
    }
    const built = buildCustomSizing(draft, category)
    if (sizing) {
      updateCustomSizing(sizing.id, built)
      onSaved({ ...sizing, ...built })
    } else onSaved(addCustomSizing(built))
  }

  function requestClose() {
    if (discarding) setDiscarding(false)
    else if (dirty) setDiscarding(true)
    else onClose()
  }

  const buttons = 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'
  const footer = discarding ? (
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
      <button type="button" onClick={requestClose} className={SECONDARY_BUTTON}>
        Cancel
      </button>
      <button type="submit" form={FORM_ID} disabled={editing && !dirty} className={PRIMARY_BUTTON}>
        {editing ? 'Save sizing' : 'Add custom sizing'}
      </button>
    </div>
  )

  return (
    <Modal variant="sheet" open onClose={requestClose} title={discarding ? 'Are you sure?' : editing ? 'Edit custom sizing' : 'Add custom sizing'} footer={footer}>
      {discarding && (
        <p className="pb-5 text-base leading-relaxed text-fg-muted">
          {editing ? `Your changes to ${sizing.name} haven't been saved yet.` : "This custom sizing hasn't been added yet."} Closing now discards {editing ? 'them' : 'everything you entered'}.
        </p>
      )}
      <form id={FORM_ID} noValidate hidden={discarding} onSubmit={submit} className="grid gap-5 pb-5">
        <div className="grid gap-1">
          <p className="text-xs text-fg-muted">Category</p>
          <p className="text-sm text-fg">{category}</p>
        </div>
        {editing && (
          <p className="text-xs text-fg-muted">
            Measurements update everywhere this sizing is used. Products already created keep the size names they have, so renaming or removing a size here doesn&apos;t change their variants.
          </p>
        )}
        {!editing && <p className="text-xs text-fg-muted">Use this when a product&apos;s sizes don&apos;t follow the {category} base sizes. It is listed under {category} and can be picked when adding a product.</p>}
        <CustomSizingEditor category={category} draft={draft} onChange={setDraft} idPrefix="cs" error={error} touch={touch} />
      </form>
    </Modal>
  )
}
