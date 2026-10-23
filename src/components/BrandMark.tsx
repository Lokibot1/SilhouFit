import type { ReactNode } from 'react'
import { SilhouetteMark } from './landing/SilhouetteMark'

/** The SilhouFit logo: the silhouette and the wordmark. `children` is the small line under the wordmark, or beside it when `inline`; `bold` thickens the mark's hairlines so it reads on a small, light bar. */
export function BrandMark({ children, bold = false, inline = false }: { children?: ReactNode; bold?: boolean; inline?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <SilhouetteMark className={`h-8 w-6 text-fg ${bold ? '[&>path]:[stroke-width:7]' : ''}`} />
      <span className={inline ? 'flex items-baseline gap-2 leading-none' : 'leading-none'}>
        <span className="font-display block text-[17px] font-bold tracking-[-0.02em] text-fg">SilhouFit</span>
        {children}
      </span>
    </span>
  )
}
