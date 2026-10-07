import { getPasswordRequirements, getPasswordStrength } from '../../utils/signUpValidation'
import { CheckIcon } from './icons'

const BAR_COLOR = ['bg-danger', 'bg-danger', 'bg-chrome-strong', 'bg-chrome-strong', 'bg-success']

interface PasswordChecklistProps {
  password: string
  email: string
  firstName: string
  /** Hidden visually and from assistive tech, but space stays reserved. */
  visible: boolean
}

export function PasswordChecklist({ password, email, firstName, visible }: PasswordChecklistProps) {
  const requirements = getPasswordRequirements(password)
  const { level, label } = getPasswordStrength(password, { email, firstName })

  return (
    <div
      role="group"
      aria-label="Password requirements"
      className={`space-y-2 rounded-xl border border-line px-4 py-3 transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'invisible opacity-0'
      }`}
    >
      <div className="flex min-h-6 items-center gap-3">
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {[1, 2, 3, 4].map((bar) => (
            <span key={bar} className="h-1 flex-1 overflow-hidden rounded-full bg-line-strong">
              <span
                className={`block h-full origin-left rounded-full transition-transform duration-300 ease-out ${BAR_COLOR[level]} ${
                  level >= bar ? 'scale-x-100' : 'scale-x-0'
                }`}
              />
            </span>
          ))}
        </div>
        <p aria-live="polite" className="text-sm text-fg">
          <span className="sr-only">Strength: </span>
          {password ? label : 'Too weak'}
        </p>
      </div>

      <ul role="list" className="space-y-1 sm:grid sm:grid-cols-2 sm:gap-x-4 sm:space-y-0">
        {requirements.map(({ id, label: text, met }) => (
          <li key={id} className="flex min-h-6 items-center gap-2 text-sm">
            {met ? (
              <CheckIcon className="text-success" />
            ) : (
              <span aria-hidden="true" className="size-4 shrink-0 rounded-full border border-line-strong" />
            )}
            <span className={met ? 'text-fg' : 'text-fg-muted'}>{text}</span>
            <span className="sr-only">{met ? 'met' : 'not met'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
