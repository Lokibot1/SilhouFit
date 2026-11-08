import { KRAL_CHIP, SHOP_SECONDARY } from './shopControls'

interface PaginationProps {
  page: number
  pageCount: number
  from: number
  to: number
  total: number
  onPage: (page: number) => void
  /** 'kral' sets square mono buttons with the current page filled; unset leaves the skeuomorphic ones. */
  tone?: 'kral'
}

/** Page numbers to show: first, last and the current page's neighbours, with 0 marking a gap. */
function pageWindow(page: number, count: number) {
  const wanted = new Set([1, count, page - 1, page, page + 1])
  const shown = [...wanted].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b)
  return shown.flatMap((n, i) => (i > 0 && n - shown[i - 1] > 1 ? [0, n] : [n]))
}

const STEP = `${SHOP_SECONDARY} min-w-9 pointer-coarse:min-w-11 max-md:min-h-11 max-md:min-w-11 px-4 disabled:pointer-events-none`
const KRAL_STEP = `${KRAL_CHIP} min-w-11 px-4 disabled:pointer-events-none`

export function Pagination({ page, pageCount, from, to, total, onPage, tone }: PaginationProps) {
  const kral = tone === 'kral'
  return (
    <div className="mt-12 flex flex-col items-end gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-6">
      <p className={`${kral ? 'font-kral-mono text-kral-muted' : 'font-ui text-fg-muted'} text-sm tabular-nums`}>
        Displaying {from}–{to} of {total}
      </p>
      <nav aria-label="Pagination" className="flex items-center gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={kral ? KRAL_STEP : STEP}>
          Prev
        </button>
        <p className={`${kral ? 'font-kral-mono text-kral-muted' : 'font-ui text-fg-muted'} px-2 text-sm tabular-nums sm:sr-only`}>
          Page {page} of {pageCount}
        </p>
        <ol className="hidden items-center gap-2 sm:flex">
          {pageWindow(page, pageCount).map((n, i) => (
            <li key={n || `gap-${i}`}>
              {n === 0 ? (
                <span aria-hidden="true" className={`px-1 ${kral ? 'font-kral-mono text-kral-muted' : 'text-fg-muted'}`}>
                  …
                </span>
              ) : (
                <button
                  type="button"
                  aria-current={n === page ? 'page' : undefined}
                  aria-label={`Page ${n}`}
                  onClick={() => onPage(n)}
                  className={kral ? `${KRAL_CHIP} min-w-11 px-0 tabular-nums` : `${SHOP_SECONDARY} min-w-9 pointer-coarse:min-w-11 max-md:min-h-11 max-md:min-w-11 tabular-nums`}
                >
                  {n}
                </button>
              )}
            </li>
          ))}
        </ol>
        <button type="button" disabled={page >= pageCount} onClick={() => onPage(page + 1)} className={kral ? KRAL_STEP : STEP}>
          Next
        </button>
      </nav>
    </div>
  )
}
