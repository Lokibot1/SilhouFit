import { useId, useState, type Ref } from 'react'
import { StarIcon } from '../form/icons'
import { Tooltip } from '../ui/Tooltip'

const WORDS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent']
const STARS = [1, 2, 3, 4, 5]
const FILLED = 'text-kral-red-ink'
const EMPTY = 'text-kral-muted'

interface StarRatingProps {
  /** 0 when nothing is chosen yet. */
  value: number
  onChange: (rating: number) => void
  disabled?: boolean
  /** The first star's input, so a form can focus the field when it is invalid. */
  firstRef?: Ref<HTMLInputElement>
  error?: string
  errorId?: string
}

/** One group of five native radio buttons, so the arrow keys and a single Tab stop work as the browser gives them. Hovering with a mouse previews a rating without choosing it. */
export function StarRating({ value, onChange, disabled, firstRef, error, errorId }: StarRatingProps) {
  const name = useId()
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="font-kral-mono text-base text-kral-muted md:text-xs md:tracking-[0.08em] md:uppercase">Your rating</legend>
      <div className="-ml-2 flex" onPointerLeave={() => setHover(null)}>
        {STARS.map((n) => (
          <Tooltip key={n} tone="kral" label={`${n} star${n > 1 ? 's' : ''}: ${WORDS[n - 1]}`}>
            <label
              className="flex size-11 cursor-pointer items-center justify-center has-disabled:cursor-not-allowed has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-kral-red-ink"
              onPointerEnter={(event) => event.pointerType === 'mouse' && setHover(n)}
            >
              <input
                ref={n === 1 ? firstRef : undefined}
                type="radio"
                name={name}
                value={n}
                checked={value === n}
                onChange={() => onChange(n)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                className="sr-only"
              />
              <span className="sr-only">
                {n} star{n > 1 ? 's' : ''}: {WORDS[n - 1]}
              </span>
              <StarIcon size={20} className={`size-6 ${n <= shown ? FILLED : EMPTY}`} />
            </label>
          </Tooltip>
        ))}
      </div>
    </fieldset>
  )
}

/** A rating that is only shown. */
export function StarDisplay({ rating }: { rating: number }) {
  return (
    <span role="img" aria-label={`Rated ${rating} out of 5`} className="inline-flex gap-0.5">
      {STARS.map((n) => (
        <StarIcon key={n} size={20} className={n <= rating ? FILLED : EMPTY} />
      ))}
    </span>
  )
}
