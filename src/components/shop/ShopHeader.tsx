// Static copy, shared by the page and its route fallback so the swap does not shift the layout.
export function ShopHeader() {
  return (
    <header className="mx-auto max-w-6xl px-6 pt-40 pb-12">
      <p className="font-ui flex items-center gap-2 text-[11px] tracking-[0.16em] text-chrome-strong uppercase">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-chrome-strong" />
        Catalogue · Prototype
      </p>
      <h1 className="display mt-4 text-[clamp(2.75rem,6.5vw,5.5rem)] text-fg">Shop the rail</h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-fg-muted">
        Pieces from three local boutiques, with one stock count across the shop floor and the website. Prices and
        stock here are sample data while the store connection is built.
      </p>
    </header>
  )
}
