import { useState } from 'react'
import { WORD_LANGUAGES, WORD_MAX, type ProfanityWord } from '../../../service/profanity'
import { CheckIcon, PlusIcon, SpinnerIcon, XIcon } from '../../form/icons'
import { Field, FIELD_INPUT, SELECT_FLAT, SelectField } from '../../staff/inventory/FormField'
import { CREATE_BUTTON, SECONDARY_BUTTON, UPDATE_BUTTON } from '../../ui/buttonStyles'
import { Modal } from '../../ui/Modal'
import { Select } from '../../ui/Select'

interface WordFormModalProps {
  open: boolean
  /** The word to change; null adds a new one. */
  word: ProfanityWord | null
  pending: boolean
  /** Why the last save failed; the dialog stays open so the text is not lost. */
  error: string | null
  onSave: (input: { word: string; language: string }) => void
  onClose: () => void
}

/** Letters (any language, with accents) and spaces: no digits, symbols or emoji. */
const LETTERS_ONLY = /^[\p{L}\p{M} ]+$/u

/** Adds a word to the filter, or changes one. Mount it with a new `key` per opening so the fields start from that word. */
export function WordFormModal({ open, word, pending, error, onSave, onClose }: WordFormModalProps) {
  const [text, setText] = useState(word?.word ?? '')
  const [language, setLanguage] = useState(word?.language ?? 'en')
  const id = word ? `word-${word.id}` : 'word-new'
  const typed = text.trim()
  const invalid = typed !== '' && !LETTERS_ONLY.test(typed) ? "Use letters and spaces only. Numbers, symbols and emoji aren't allowed." : undefined
  const unchanged = !!word && typed.toLowerCase() === word.word && language === word.language
  const canSave = typed !== '' && !invalid && !unchanged && !pending

  return (
    <Modal
      open={open}
      onClose={pending ? () => {} : onClose}
      title={word ? 'Edit word' : 'Add word'}
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={pending} className={`${SECONDARY_BUTTON} disabled:opacity-60`}>
            <XIcon />
            Cancel
          </button>
          <button type="submit" form={`${id}-form`} disabled={!canSave} aria-busy={pending} className={word ? UPDATE_BUTTON : CREATE_BUTTON}>
            {pending ? <SpinnerIcon /> : word ? <CheckIcon /> : <PlusIcon />}
            {word ? 'Save word' : 'Add Word'}
          </button>
        </div>
      }
    >
      <form
        id={`${id}-form`}
        onSubmit={(event) => {
          event.preventDefault()
          if (canSave) onSave({ word: typed, language })
        }}
        className="grid gap-3 pb-5"
      >
        <Field id={id} label="Word or phrase" count={{ value: text.length, max: WORD_MAX }} error={invalid} hint="Saved in lowercase.">
          <input
            id={id}
            type="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={WORD_MAX}
            readOnly={pending}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!invalid}
            aria-describedby={invalid ? `${id}-error` : `${id}-hint`}
            className={FIELD_INPUT}
          />
        </Field>
        <SelectField label="Language">
          <Select label="Language" value={language} options={WORD_LANGUAGES} onChange={setLanguage} className={SELECT_FLAT} />
        </SelectField>
        <p className="text-sm text-fg-muted">Customers&apos; chat messages and reviews that contain this word are hidden with asterisks and counted as an offense.</p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
