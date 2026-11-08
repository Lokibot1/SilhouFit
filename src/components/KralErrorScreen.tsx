import type { ReactNode } from 'react'
import { KralErrorBackdrop } from './KralErrorBackdrop'
import { WORDMARK } from './landing-v2/wordmark'

interface Props {
  /** The HTTP-style number, shown as the giant cropped numerals and in the (ERROR n) label. */
  code: string
  /** Short mono label after the code, e.g. "Page not found". */
  status: string
  heading: string
  /** True when the screen appears without the user asking for it (a crash): announced as an alert. */
  alert?: boolean
  /** Lifts the text and the numerals about 5vh, so the numerals are cropped less. */
  raised?: boolean
  /** Plain explanation, then the actions and anything below them. */
  children: ReactNode
}

// Shared by the 404 and 500 pages: one full-screen, non-scrolling view with only the KRAL logo (no header, footer or nav).
// No hooks and no router: the 500 renders when the app itself has failed, so the logo is a plain anchor and each
// page passes its own links. The numerals shrink with the viewport height and are dropped on very short screens.
export function KralErrorScreen({ code, status, heading, alert, raised, children }: Props) {
  return (
    <div className="relative flex h-svh flex-col overflow-hidden bg-kral-bg font-kral-mono text-kral-fg">
      <KralErrorBackdrop />
      <header className="relative mx-auto flex min-h-16 w-full max-w-6xl shrink-0 items-center px-6 2xl:max-w-[88rem]">
        <a href="/" aria-label="KRAL home" className="kral-focus flex min-h-11 items-center hover:text-kral-red-ink">
          <svg className="block h-4 w-auto fill-current" viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`} aria-hidden="true">
            <path fillRule="evenodd" d={WORDMARK.letters.map((l) => l.d).join('')} />
          </svg>
          <span aria-hidden="true" className="ml-0.5 self-start pt-3 text-xs leading-none">&reg;</span>
        </a>
      </header>
      <section className="relative flex min-h-0 flex-1 flex-col">
        <div className={`mx-auto flex w-full max-w-6xl min-h-0 flex-1 flex-col justify-center px-6 py-4 2xl:max-w-[88rem] ${raised ? '-translate-y-[5vh]' : ''}`} role={alert ? 'alert' : undefined}>
          <p className="text-sm font-medium tracking-[0.08em] text-kral-red-ink uppercase">
            (Error <span className="tabular-nums">{code}</span>) // {status}
          </p>
          <h1 className="mt-4 max-w-[16ch] font-kral-display text-[clamp(1.75rem,min(6vw,6vh),3rem)] leading-[1.05] font-extrabold uppercase">
            {heading}
          </h1>
          {children}
        </div>
        {/* Decorative: the label and heading carry the meaning. Roughly the bottom quarter of the digits is cropped by the bottom edge (and the right edge on phones), as the wordmark is.
            In the flow under the text on phones, so it can never overlap it; pinned bottom, right of centre from lg, where the text stays in the left half. */}
        <div
          aria-hidden="true"
          className={`pointer-events-none w-full shrink-0 overflow-hidden text-right font-kral-display text-[min(28vw,24vh)] font-extrabold select-none [@media(max-height:30rem)]:hidden lg:absolute lg:right-[2vw] lg:bottom-0 lg:w-auto lg:text-[min(26vw,48vh)] ${raised ? 'h-[calc(0.74em+5vh)] lg:h-[calc(0.62em+5vh)]' : 'h-[0.74em] lg:h-[0.62em]'}`}
        >
          <p className="translate-x-[3%] leading-[0.8] lg:translate-x-0 tracking-tight whitespace-nowrap tabular-nums">{code}</p>
        </div>
      </section>
    </div>
  )
}
