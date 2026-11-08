/** `tone="kral"` restyles the revealed link flat and square for the storefront pages. */
export function SkipLink({ tone }: { tone?: 'kral' }) {
  return (
    <a
      href="#main-content"
      onClick={() => document.getElementById('main-content')?.focus()}
      className={`sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold ${
        tone === 'kral'
          ? 'kral-focus focus:bg-kral-fg focus:font-kral-mono focus:tracking-[0.08em] focus:text-kral-bg focus:uppercase'
          : 'focus:rounded-md focus:bg-fg focus:text-canvas'
      }`}
    >
      Skip to main content
    </a>
  )
}
