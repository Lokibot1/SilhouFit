import { WORDMARK } from './wordmark'

/** The solid KRAL(R) wordmark, shared outline with the hero and footer. Decorative: the link that wraps it carries the name. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`} aria-hidden="true" focusable="false">
      <path fillRule="evenodd" d={WORDMARK.letters.map((l) => l.d).join('')} />
    </svg>
  )
}
