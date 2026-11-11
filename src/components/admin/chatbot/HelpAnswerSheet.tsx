import { useRef, useState, type FormEvent } from 'react'
import { useCurrentUser } from '../../../hooks/useCurrentUser'
import { createHelpAnswer, HELP_CATEGORIES, HELP_CATEGORY_LABELS, HELP_LINK_PATHS, updateHelpAnswer, type HelpAnswer, type HelpAnswerInput, type HelpCategory, type PublicPath } from '../../../service/helpAnswers'
import { HELP_FIELD_ORDER, HELP_LIMITS, parseKeywords, validateHelpAnswer, type HelpErrors, type HelpField, type HelpFormValues } from '../../../utils/helpAnswerValidation'
import { stripEmoji } from '../../../utils/signUpValidation'
import { AlertIcon, SpinnerIcon } from '../../form/icons'
import { Field, FIELD_INPUT, SELECT_FLAT, SelectField } from '../../staff/inventory/FormField'
import { useToast } from '../../toast/useToast'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { Checkbox } from '../../ui/Checkbox'
import { Modal } from '../../ui/Modal'
import { Select } from '../../ui/Select'
import { Tooltip } from '../../ui/Tooltip'

const FORM_ID = 'help-answer-form'
const fieldId = (name: HelpField) => `help-${name}`
const TEXTAREA = `${FIELD_INPUT} resize-none`

const TOPIC_OPTIONS = HELP_CATEGORIES.map((value) => ({ value, label: HELP_CATEGORY_LABELS[value] }))
const LINK_LABELS: Record<PublicPath, string> = {
  '/shop': 'Shop',
  '/about': 'About',
  '/contact': 'Contact',
  '/signup': 'Sign up',
  '/orders': 'My orders',
  '/profile/measurements': 'Body measurements',
  '/refund-policy': 'Refund policy',
  '/privacy-policy': 'Privacy policy',
  '/terms-of-service': 'Terms of service',
  '/cookie-policy': 'Cookie policy',
}
const LINK_OPTIONS: { value: PublicPath | 'none'; label: string }[] = [{ value: 'none', label: 'No link' }, ...HELP_LINK_PATHS.map((value) => ({ value, label: LINK_LABELS[value] }))]

const without = (errors: HelpErrors, name: HelpField): HelpErrors => Object.fromEntries(Object.entries(errors).filter(([key]) => key !== name))

function initial(answer: HelpAnswer | null): HelpFormValues {
  if (!answer) return { question: '', answer: '', keywords: '', category: 'orders', linkTo: '', linkLabel: '', published: false }
  return {
    question: answer.question,
    answer: answer.answer,
    keywords: answer.keywords.join(', '),
    category: answer.category,
    linkTo: answer.link?.to ?? '',
    linkLabel: answer.link?.label ?? '',
    published: answer.published,
  }
}

interface HelpAnswerSheetProps {
  open: boolean
  onClose: () => void
  /** The answer to change; null adds a new one. */
  answer: HelpAnswer | null
}

/** Adds or edits a help answer. Give it a new `key` for every open so it starts from the answer (or empty). */
export function HelpAnswerSheet({ open, onClose, answer }: HelpAnswerSheetProps) {
  const toast = useToast()
  const by = useCurrentUser()?.name ?? 'Admin'
  const editing = answer !== null
  const [values, setValues] = useState(() => initial(answer))
  const [touched, setTouched] = useState<Partial<Record<HelpField, boolean>>>({})
  const [serverErrors, setServerErrors] = useState<HelpErrors>({})
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const inFlight = useRef(false)

  const all = validateHelpAnswer(values)
  const errors: HelpErrors = { ...Object.fromEntries(Object.entries(all).filter(([name]) => touched[name as HelpField])), ...serverErrors }

  function set<K extends HelpField>(name: K, value: HelpFormValues[K]) {
    setValues((current) => ({ ...current, [name]: value }))
    setServerErrors((current) => without(current, name))
    setFailure(null)
  }

  async function submit() {
    if (inFlight.current) return
    setTouched(Object.fromEntries(HELP_FIELD_ORDER.map((name) => [name, true])))
    const first = HELP_FIELD_ORDER.find((name) => all[name])
    if (first) {
      document.getElementById(fieldId(first))?.focus()
      return
    }
    const input: HelpAnswerInput = {
      question: values.question.trim(),
      answer: values.answer.trim(),
      keywords: parseKeywords(values.keywords),
      category: values.category,
      link: values.linkTo ? { to: values.linkTo, label: values.linkLabel.trim() } : null,
      published: values.published,
    }
    inFlight.current = true
    setPending(true)
    setFailure(null)
    try {
      if (answer) await updateHelpAnswer(answer.id, input, by)
      else await createHelpAnswer(input, by)
      toast.show({ kind: 'success', message: `Question "${input.question}" ${editing ? 'saved' : 'added'}${input.published ? '' : ' as a draft'}` })
      onClose()
    } catch (error) {
      const { kind, field, message } = error as { kind?: string; field?: HelpField; message: string }
      if (kind === 'validation' && field) {
        setServerErrors({ [field]: message })
        document.getElementById(fieldId(field))?.focus()
      } else {
        setFailure(`The request failed before anything was saved, so ${editing ? 'the question is unchanged' : 'no question was added'}. Check your connection, then try again. What you typed is still here.`)
      }
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  const input = (name: 'question' | 'answer' | 'keywords' | 'linkLabel', hint = false) => ({
    id: fieldId(name),
    value: values[name],
    readOnly: pending,
    onChange: (event: { target: { value: string } }) => set(name, stripEmoji(event.target.value)),
    onBlur: () => setTouched((current) => ({ ...current, [name]: true })),
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': [errors[name] && `${fieldId(name)}-error`, hint && `${fieldId(name)}-hint`].filter(Boolean).join(' ') || undefined,
    autoComplete: 'off',
    spellCheck: name === 'answer' || name === 'question',
  })

  return (
    <Modal
      variant="sheet"
      open={open}
      onClose={pending ? () => {} : onClose}
      title={answer ? 'Edit question' : 'Add question'}
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={pending} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          <button type="submit" form={FORM_ID} disabled={pending} aria-busy={pending} className={PRIMARY_BUTTON}>
            {pending && <SpinnerIcon />}
            {pending ? (editing ? 'Saving…' : 'Adding…') : editing ? 'Save changes' : 'Add question'}
          </button>
        </div>
      }
    >
      <form
        id={FORM_ID}
        noValidate
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          void submit()
        }}
        aria-busy={pending}
        className="grid gap-4 pb-5"
      >
        <Field id={fieldId('question')} label="Question" count={{ value: values.question.length, max: HELP_LIMITS.questionMax }} error={errors.question}>
          <input {...input('question')} type="text" />
        </Field>
        <Field id={fieldId('answer')} label="Answer" count={{ value: values.answer.length, max: HELP_LIMITS.answerMax }} error={errors.answer}>
          <textarea {...input('answer', true)} rows={5} className={TEXTAREA} />
          <p id={`${fieldId('answer')}-hint`} className="text-xs text-fg-muted">
            Plain text. No emails, phone numbers or web addresses: point customers to the Contact page with the link below.
          </p>
        </Field>
        <SelectField label="Topic">
          <Select label="Topic" value={values.category} options={TOPIC_OPTIONS} onChange={(value: HelpCategory) => set('category', value)} className={SELECT_FLAT} />
        </SelectField>
        <Field id={fieldId('keywords')} label="Keywords" optional count={{ value: parseKeywords(values.keywords).length, max: HELP_LIMITS.keywordsMax }} error={errors.keywords}>
          <input {...input('keywords', true)} type="text" className={FIELD_INPUT} />
          <p id={`${fieldId('keywords')}-hint`} className="text-xs text-fg-muted">
            Words customers might type, separated by commas. They help the chat find this answer.
          </p>
        </Field>
        <SelectField label="Link page">
          <Select
            label="Link page"
            value={values.linkTo || 'none'}
            options={LINK_OPTIONS}
            onChange={(value) => set('linkTo', value === 'none' ? '' : value)}
            className={SELECT_FLAT}
          />
        </SelectField>
        {values.linkTo && (
          <Field id={fieldId('linkLabel')} label="Link text" count={{ value: values.linkLabel.length, max: HELP_LIMITS.linkLabelMax }} error={errors.linkLabel}>
            <input {...input('linkLabel')} type="text" />
          </Field>
        )}
        <div>
          <Tooltip label="A draft is saved here but customers do not see it. Publish it when the answer is ready." wrap>
            <Checkbox label="Published" checked={values.published} onChange={(checked) => set('published', checked)} disabled={pending}>
              Published
            </Checkbox>
          </Tooltip>
          <p className="text-xs text-fg-muted">{values.published ? 'Customers see this answer in the Help chat right away.' : 'Saved as a draft. Customers do not see it yet.'}</p>
        </div>
        {failure && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger p-3">
            <AlertIcon size={20} className="mt-0.5 shrink-0 text-danger" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">{`We couldn't ${editing ? 'save' : 'add'} the question.`}</p>
              <p className="mt-1 text-sm text-fg-muted">{failure}</p>
            </div>
          </div>
        )}
      </form>
    </Modal>
  )
}
