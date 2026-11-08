import { getPasswordRequirements, getPasswordStrength } from '../../utils/signUpValidation'
import { CheckIcon } from './icons'

const BAR_COLOR = ['bg-danger', 'bg-danger', 'bg-chrome-strong', 'bg-chrome-strong', 'bg-success']

interface PasswordChecklistProps {
  password: string
  email: string
  firstName: string
  /** Hidden visually and from assistive tech, but space stays reserved. */
  visible: boolean
  /** Extra classes, e.g. to float it as a tooltip. */
  className?: string
  /** 'kral' sets the box square with KRAL ink and rules for the KRAL pages. */
  tone?: 'kral'
}

export function PasswordChecklist({ password, email, firstName, visible, className = '', tone }: PasswordChecklistProps) {
  const kral = tone === 'kral'
  const requirements = getPasswordRequirements(password)
  const { level, label } = getPasswordStrength(password, { email, firstName })

  return (
    <div
      role="group"
      aria-label="Password requirements"
      className={`space-y-2 ${kral ? 'font-kral-mono rounded-none border-kral-rule' : 'rounded-xl border-line'} border px-4 py-3 transition-[opacity,visibility] duration-200 ${
        visible ? 'opacity-100' : 'invisible opacity-0'
      } ${className}`}
    >
      <div className="flex min-h-6 items-center gap-3">
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {[1, 2, 3, 4].map((bar) => (
            <span key={bar} className="h-1 flex-1 overflow-hidden ${kral ? 'rounded-none bg-kral-rule/40' : 'rounded-full bg-line-strong'}">
              <span
                className={`block h-full origin-left ${kral ? 'rounded-none bg-kral-fg' : `rounded-full ${BAR_COLOR[level]}`} transition-transform duration-300 ease-out ${
                  level >= bar ? 'scale-x-100' : 'scale-x-0'
                }`}
              />
            </span>
          ))}
        </div>
        <p aria-live="polite" className={kral ? 'text-base text-kral-fg md:text-sm' : 'text-sm text-fg'}>
          <span className="sr-only">Strength: </span>
          {password ? label : 'Too weak'}
        </p>
      </div>

      <ul role="list" className="space-y-1 sm:grid sm:grid-cols-2 sm:gap-x-4 sm:space-y-0">
        {requirements.map(({ id, label: text, met }) => (
          <li key={id} className={`flex min-h-6 items-center gap-2 ${kral ? 'text-base md:text-sm' : 'text-sm'}`}>
            {met ? (
              <CheckIcon className={kral ? 'text-kral-fg' : 'text-success'} />
            ) : (
              <span aria-hidden="true" className={`size-4 shrink-0 border ${kral ? 'rounded-none border-kral-muted' : 'rounded-full border-line-strong'}`} />
            )}
            <span className={kral ? (met ? 'text-kral-fg' : 'text-kral-muted') : met ? 'text-fg' : 'text-fg-muted'}>{text}</span>
            <span className="sr-only">{met ? 'met' : 'not met'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
