import { useState } from 'react'
import { Link } from 'react-router-dom'
import { UpdateMeError } from '../../service/updateMe'
import { latestBirthday, validateBirthday } from '../../utils/accountValidation'
import { ageFrom, MIN_AGE } from '../../utils/age'
import { CALLBACK_BLOCK } from '../form/CallbackSkeleton'
import { SpinnerIcon } from '../form/icons'
import { BirthdayField } from '../profile/BirthdayField'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../ui/buttonStyles'

interface AgeConfirmProps {
  /** Called with a valid 18+ birthday. Rejects if it could not be saved. */
  onConfirm: (birthday: string) => Promise<void>
  /** Called when the birthday makes them under 18. */
  onUnderage: () => void
  /** Back to login, which also signs out. */
  loginHref: string
  onLeave: () => void
}

/** Google gave no birthday, so the new account is held here until the person says they are 18 or older. */
export function AgeConfirm({ onConfirm, onUnderage, loginHref, onLeave }: AgeConfirmProps) {
  const [birthday, setBirthday] = useState('')
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (pending) return
    const invalid = birthday ? validateBirthday(birthday) : `Enter your birthday. You must be ${MIN_AGE} or older to continue.`
    if (invalid) return setError(invalid)
    if (ageFrom(birthday) < MIN_AGE) return onUnderage()
    setError(undefined)
    setPending(true)
    try {
      await onConfirm(birthday)
    } catch (failure) {
      setPending(false)
      setError(
        failure instanceof UpdateMeError && failure.kind === 'network'
          ? "We couldn't save your birthday. The connection dropped. Check your connection and try again."
          : "We couldn't save your birthday. Something went wrong on our side. Try again in a moment.",
      )
    }
  }

  return (
    <form noValidate onSubmit={submit} aria-busy={pending} className={CALLBACK_BLOCK}>
      <h1 className="display text-3xl text-fg">Confirm your age</h1>
      <p className="mt-2 text-base leading-relaxed text-fg-muted">
        Google didn&apos;t share your birthday. KRAL accounts are for people {MIN_AGE} or older, so enter yours to continue.
      </p>
      <div className="mt-4">
        <BirthdayField
          id="age-birthday"
          label="Birthday"
          value={birthday}
          max={latestBirthday()}
          error={error}
          readOnly={pending}
          onChange={(value) => {
            setBirthday(value)
            setError(undefined)
          }}
          onBlur={() => birthday && setError(validateBirthday(birthday) ?? undefined)}
        />
      </div>
      <div className="mt-auto flex flex-col gap-3 pt-6">
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? (
            <>
              <SpinnerIcon />
              Saving…
            </>
          ) : (
            'Continue'
          )}
        </button>
        <Link to={loginHref} onClick={onLeave} className={SECONDARY_BUTTON}>
          Back to login
        </Link>
      </div>
    </form>
  )
}
