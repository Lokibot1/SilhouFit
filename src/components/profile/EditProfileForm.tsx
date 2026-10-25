import { useId, useRef, useState, type FormEvent } from 'react'
import type { Me } from '../../service/fetchMe'
import { updateMe, type MePatch, type UpdateMeErrorKind } from '../../service/updateMe'
import { normalizeName, stripEmoji } from '../../utils/signUpValidation'
import { FloatingField } from '../form/FloatingField'
import { AlertIcon, SpinnerIcon } from '../form/icons'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../ui/buttonStyles'
import { Select } from '../ui/Select'

const NAME = /^[\p{L}][\p{L} '-]*$/u
const WORD_MAX = 30
const NAME_MAX = 100
const SUFFIX_MAX = 20
const DATE_INPUT =
  'font-ui min-h-11 w-full rounded-xl border border-line-strong bg-canvas px-3 text-base text-fg scheme-light dark:scheme-dark'
const GENDER_OPTIONS: { value: '' | NonNullable<Me['gender']>; label: string }[] = [
  { value: '', label: 'Not specified' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'unisex', label: 'Unisex' },
]

const EMOJI_ERROR = "Emoji aren't allowed in this field."

const FAILURE_COPY: Record<Exclude<UpdateMeErrorKind, 'unauthorized' | 'invalid'>, string> = {
  network: "We couldn't save your profile. The connection dropped before we got a response. Check your connection and try again.",
  'rate-limit': "We couldn't save your profile. Our servers are limiting requests right now. Wait a minute, then try again.",
  server: "We couldn't save your profile. Something went wrong on our side. Try again in a moment.",
  'not-found': "We couldn't save your profile. No profile is saved for this account. Sign out and sign in again.",
}

type Field = 'firstName' | 'middleName' | 'lastName' | 'suffix' | 'birthday'
type Values = Record<Field, string> & { gender: '' | NonNullable<Me['gender']> }

/** Today as YYYY-MM-DD in the user's own time zone, the latest birthday the date input accepts. */
function today() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const hasEmoji = (value: string) => stripEmoji(value) !== value

function validateName(value: string, label: string, required: boolean): string | undefined {
  if (hasEmoji(value)) return EMOJI_ERROR
  const name = normalizeName(value)
  if (!name) return required ? `${label} is required.` : undefined
  if (!NAME.test(name)) return `${label} can only contain letters, spaces, hyphens and apostrophes.`
  if (name.split(' ').some((word) => word.length > WORD_MAX)) return `Each word in ${label.toLowerCase()} can be at most ${WORD_MAX} letters.`
  return undefined
}

function validate(values: Values): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {}
  const first = validateName(values.firstName, 'First name', true)
  const middle = validateName(values.middleName, 'Middle name', false)
  const last = validateName(values.lastName, 'Last name', true)
  if (first) errors.firstName = first
  if (middle) errors.middleName = middle
  if (last) errors.lastName = last
  if (hasEmoji(values.suffix)) errors.suffix = EMOJI_ERROR
  if (values.birthday > today()) errors.birthday = 'Birthday can’t be in the future. Pick today or an earlier date.'
  return errors
}

/** The saved value of each field as the form shows it. */
const fromMe = (me: Me): Values => ({
  firstName: me.firstName,
  middleName: me.middleName ?? '',
  lastName: me.lastName,
  suffix: me.suffix ?? '',
  birthday: me.birthday ?? '',
  gender: me.gender ?? '',
})

interface EditProfileFormProps {
  me: Me
  onSaved: (me: Me) => void
  onCancel: () => void
  /** The token was rejected: the page ends the session. */
  onUnauthorized: () => void
  /** Told when a save starts and ends, so the page can keep the modal open meanwhile. */
  onPendingChange?: (pending: boolean) => void
}

/** Changes the signed-in customer's name, birthday and gender. Only the fields that differ from `me` are sent. */
export function EditProfileForm({ me, onSaved, onCancel, onUnauthorized, onPendingChange }: EditProfileFormProps) {
  const base = useId()
  const fieldId = (name: string) => `${base}-${name}`
  const saved = fromMe(me)
  const [values, setValues] = useState<Values>(saved)
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({})
  const [pending, setPending] = useState(false)
  // A failed save, shown inside the dialog so its Try again stays reachable while the dialog traps focus.
  const [failure, setFailure] = useState<{ message: string; retry: boolean } | null>(null)
  const inFlight = useRef(false)

  const set = (patch: Partial<Values>) => {
    setFailure(null)
    setValues((current) => ({ ...current, ...patch }))
  }
  const busy = (value: boolean) => {
    setPending(value)
    onPendingChange?.(value)
  }
  const touch = (name: Field) => () => setTouched((current) => ({ ...current, [name]: true }))
  const errors = validate(values)
  const shown = (name: Field) => (touched[name] ? errors[name] : undefined)

  const patch: MePatch = {}
  for (const key of ['firstName', 'lastName'] as const) {
    if (normalizeName(values[key]) !== saved[key]) patch[key] = normalizeName(values[key])
  }
  if (normalizeName(values.middleName) !== saved.middleName) patch.middleName = normalizeName(values.middleName) || null
  if (values.suffix.trim() !== saved.suffix) patch.suffix = values.suffix.trim() || null
  if (values.birthday !== saved.birthday) patch.birthday = values.birthday || null
  if (values.gender !== saved.gender) patch.gender = values.gender || null
  const changed = Object.keys(patch).length > 0

  async function save() {
    if (inFlight.current) return
    setTouched({ firstName: true, middleName: true, lastName: true, suffix: true, birthday: true })
    const first = (['firstName', 'middleName', 'lastName', 'suffix', 'birthday'] as const).find((name) => errors[name])
    if (first) {
      document.getElementById(fieldId(first))?.focus()
      return
    }
    inFlight.current = true
    setFailure(null)
    busy(true)
    try {
      onSaved(await updateMe(patch))
    } catch (error) {
      const { kind, detail } = error as { kind?: UpdateMeErrorKind; detail?: string }
      busy(false)
      if (kind === 'unauthorized') onUnauthorized()
      else if (kind === 'invalid') {
        setFailure({ message: detail ?? "The server didn't accept these details. Check each field, then save again.", retry: false })
      } else {
        setFailure({ message: FAILURE_COPY[kind ?? 'server'], retry: kind !== 'not-found' })
      }
    } finally {
      inFlight.current = false
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void save()
  }

  return (
    <form noValidate onSubmit={submit} aria-busy={pending} className="pb-5">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <FloatingField
          id={fieldId('firstName')}
          label="First name"
          value={values.firstName}
          onChange={(v) => set({ firstName: v.slice(0, NAME_MAX) })}
          onBlur={touch('firstName')}
          error={shown('firstName')}
          autoComplete="given-name"
          enterKeyHint="next"
          readOnly={pending}
        />
        <FloatingField
          id={fieldId('middleName')}
          label="Middle name (optional)"
          value={values.middleName}
          onChange={(v) => set({ middleName: v.slice(0, NAME_MAX) })}
          onBlur={touch('middleName')}
          error={shown('middleName')}
          autoComplete="additional-name"
          enterKeyHint="next"
          readOnly={pending}
        />
        <FloatingField
          id={fieldId('lastName')}
          label="Last name"
          value={values.lastName}
          onChange={(v) => set({ lastName: v.slice(0, NAME_MAX) })}
          onBlur={touch('lastName')}
          error={shown('lastName')}
          autoComplete="family-name"
          enterKeyHint="next"
          readOnly={pending}
        />
        <FloatingField
          id={fieldId('suffix')}
          label="Suffix (optional)"
          value={values.suffix}
          onChange={(v) => set({ suffix: v.slice(0, SUFFIX_MAX) })}
          onBlur={touch('suffix')}
          error={shown('suffix')}
          autoComplete="honorific-suffix"
          enterKeyHint="next"
          counter={{ current: values.suffix.length, max: SUFFIX_MAX }}
          readOnly={pending}
        />
        <div>
          <label htmlFor={fieldId('birthday')} className="font-ui mb-1 block text-sm text-fg-muted">
            Birthday (optional)
          </label>
          <input
            id={fieldId('birthday')}
            type="date"
            value={values.birthday}
            max={today()}
            onChange={(event) => set({ birthday: event.target.value })}
            onBlur={touch('birthday')}
            readOnly={pending}
            autoComplete="bday"
            aria-invalid={shown('birthday') ? true : undefined}
            aria-describedby={shown('birthday') ? fieldId('birthday-error') : undefined}
            className={DATE_INPUT}
          />
          {shown('birthday') && (
            <p id={fieldId('birthday-error')} className="flex items-start gap-1.5 px-1 pt-1 text-xs leading-snug text-danger">
              <AlertIcon className="mt-px size-3.5" />
              <span>{shown('birthday')}</span>
            </p>
          )}
        </div>
        <div className="grid gap-1">
          <p className="font-ui text-sm text-fg-muted">Gender (optional)</p>
          <Select label="Gender" value={values.gender} options={GENDER_OPTIONS} onChange={(gender) => set({ gender })} className="min-h-11!" />
        </div>
      </div>

      {failure && (
        <div role="alert" className="mt-3 grid justify-items-start gap-3">
          <p className="flex items-start gap-2 text-base leading-snug text-danger">
            <AlertIcon className="mt-1 shrink-0" />
            <span>{failure.message}</span>
          </p>
          {failure.retry && (
            <button type="button" onClick={() => void save()} disabled={pending} className={SECONDARY_BUTTON}>
              Try again
            </button>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={pending} className={`${SECONDARY_BUTTON} disabled:cursor-progress disabled:opacity-70`}>
          Cancel
        </button>
        <button type="submit" disabled={pending || !changed} className={`${PRIMARY_BUTTON} w-full sm:w-auto`}>
          {pending && <SpinnerIcon />}
          Save changes
        </button>
      </div>
    </form>
  )
}
