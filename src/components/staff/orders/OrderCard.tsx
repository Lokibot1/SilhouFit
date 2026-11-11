import { useId, type ReactNode } from 'react'

/** The small caps label every part of the order drawer opens with. */
export const CARD_LABEL = 'flex items-center gap-2 text-sm font-semibold tracking-wider text-fg-muted uppercase md:text-xs'

/** A titled panel of the order drawer: icon and label on the left, an optional note or figure on the right. */
export function OrderCard({ icon, title, aside, children }: { icon: ReactNode; title: string; aside?: ReactNode; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-xl border border-line bg-white dark:bg-fg/[0.03]">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-fg/[0.03] dark:bg-fg/[0.04] px-4 py-3">
        <h3 id={id} className={CARD_LABEL}>
          <span aria-hidden="true" className="flex">
            {icon}
          </span>
          {title}
        </h3>
        {aside}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}
