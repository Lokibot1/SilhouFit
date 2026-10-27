/** After a chip's remove button is used: focus the next chip's remove button, else the previous one's. False when it was the only chip. */
export function focusNeighbourChip(button: HTMLElement) {
  const buttons = [...(button.closest('ul')?.querySelectorAll<HTMLElement>('button') ?? [])]
  const at = buttons.indexOf(button)
  const next = buttons[at + 1] ?? buttons[at - 1]
  next?.focus()
  return next !== undefined
}

/** Focus the page's filters trigger (marked `data-filters-trigger`), or its summary (`data-filters-summary`) when the trigger is folded away. */
export function focusFiltersTrigger() {
  const trigger = document.querySelector<HTMLElement>('[data-filters-trigger]')
  trigger?.focus()
  if (document.activeElement !== trigger) document.querySelector<HTMLElement>('[data-filters-summary]')?.focus()
}
