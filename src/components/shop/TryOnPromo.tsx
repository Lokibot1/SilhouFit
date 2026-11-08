import { Link } from 'react-router-dom'
import { KRAL_PRIMARY, KRAL_SECONDARY } from './shopControls'

export function TryOnPromo() {
  return (
    <section
      aria-labelledby="try-on-heading"
      className="relative mt-16 overflow-hidden rounded-2xl border border-kral-rule p-6 sm:p-10"
    >
      <span
        aria-hidden="true"
        className="font-kral-display pointer-events-none absolute -right-4 -bottom-10 text-[10rem] leading-none font-extrabold text-kral-fg/5 select-none sm:text-[16rem]"
      >
        FIT
      </span>
      <div className="relative max-w-xl">
        <p className="font-kral-mono text-xs tracking-[0.08em] text-kral-red-ink uppercase">(AR fitting)</p>
        <h2 id="try-on-heading" className="font-kral-display mt-3 text-[clamp(1.5rem,3.5vw,2.25rem)] leading-[1.05] font-extrabold text-kral-fg uppercase">
          Try pieces on before you buy them.
        </h2>
        <p className="font-kral-mono mt-4 text-base leading-relaxed text-kral-muted">
          Your camera and a browser are enough to see how a garment sits on you. Nothing is uploaded.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link to={{ pathname: '/about', hash: '#how-it-works' }} className={`${KRAL_PRIMARY} whitespace-normal! text-center`}>
            See how AR fitting works
          </Link>
          <Link to="/about#how-it-works" className={`${KRAL_SECONDARY} whitespace-normal! text-center`}>
            How sizing works
          </Link>
        </div>
      </div>
    </section>
  )
}
