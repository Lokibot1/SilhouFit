import { Link } from 'react-router-dom'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../ui/buttonStyles'

export function TryOnPromo() {
  return (
    <section
      aria-labelledby="try-on-heading"
      className="glass-card relative mt-16 overflow-hidden rounded-2xl p-6 sm:p-10"
    >
      <span
        aria-hidden="true"
        className="display pointer-events-none absolute -right-4 -bottom-10 text-[10rem] leading-none text-fg/5 select-none sm:text-[16rem]"
      >
        FIT
      </span>
      <div className="relative max-w-xl">
        <p className="font-ui text-[11px] tracking-[0.16em] text-chrome-strong uppercase">AR fitting</p>
        <h2 id="try-on-heading" className="display mt-3 text-[clamp(1.75rem,4vw,2.75rem)] text-fg">
          Try pieces on before you buy them.
        </h2>
        <p className="mt-4 text-base leading-relaxed text-fg-muted">
          Your camera and a browser are enough to see how a garment sits on you. Nothing is uploaded.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link to="/#ar-fitting" className={PRIMARY_BUTTON}>
            See how AR fitting works
          </Link>
          <Link to="/about#how-it-works" className={SECONDARY_BUTTON}>
            How sizing works
          </Link>
        </div>
      </div>
    </section>
  )
}
