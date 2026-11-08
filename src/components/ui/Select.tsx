import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { DURATION, EASE_OUT } from '../../motion/tokens'
import { CheckIcon, ChevronDownIcon, ChevronRightIcon } from '../form/icons'
import { computePlace, KRAL_LISTBOX_PANEL, kralOptionRow, LISTBOX_LIST, LISTBOX_PANEL, optionRow } from './listbox'

const MIN_WIDTH = 176
// Rough width of one label character plus the row's padding and check mark, so no option is ever truncated.
const CHAR_PX = 8.6
// Mono caps are wider (16px on phones).
const KRAL_CHAR_PX = 10
const ROW_EXTRA_PX = 64
const TYPEAHEAD_MS = 500

export interface SelectOption<T> {
  value: T
  label: string
  /** What the trigger shows for this pick instead of the label (a chosen range of dates, say). */
  summary?: string
  /**
   * Choosing this option keeps the list open and shows this beside it, like a submenu, in place of closing. Call `done` to close both.
   */
  submenu?: (done: () => void) => ReactNode
}

const FLYOUT_GAP = 4
const FLYOUT_EDGE = 8

// Fixed to the viewport beside the list, level with its row: to the right, or to the left when there is no room, and inside the screen edges.
function Flyout({ panel, row, onEscape, children }: { panel: RefObject<HTMLDivElement | null>; row: string; onEscape: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState({ left: -9999, top: 0 })

  useLayoutEffect(() => {
    function position() {
      const side = panel.current?.getBoundingClientRect()
      const box = ref.current?.getBoundingClientRect()
      if (!side || !box) return
      const rowTop = document.getElementById(row)?.getBoundingClientRect().top ?? side.top
      const onRight = side.right + FLYOUT_GAP + box.width + FLYOUT_EDGE <= window.innerWidth
      const onLeft = side.left - FLYOUT_GAP - box.width >= FLYOUT_EDGE
      const left = onRight ? side.right + FLYOUT_GAP : onLeft ? side.left - FLYOUT_GAP - box.width : Math.max(FLYOUT_EDGE, window.innerWidth - box.width - FLYOUT_EDGE)
      const top = Math.min(Math.max(FLYOUT_EDGE, rowTop - 12), Math.max(FLYOUT_EDGE, window.innerHeight - box.height - FLYOUT_EDGE))
      setPlace({ left, top })
    }
    position()
    // A month with six weeks is taller than one with five.
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(position)
    resize?.observe(ref.current!)
    window.addEventListener('resize', position)
    document.addEventListener('scroll', position, true)
    return () => {
      resize?.disconnect()
      window.removeEventListener('resize', position)
      document.removeEventListener('scroll', position, true)
    }
  }, [panel, row])

  return createPortal(
    <motion.div
      ref={ref}
      data-select-flyout=""
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -4 }}
      transition={{ duration: DURATION.state, ease: EASE_OUT }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation() // closes the lists, not a dialog around them
          onEscape()
        }
      }}
      style={place}
      className="fixed z-(--z-popover) w-max max-w-[calc(100vw-1rem)] rounded-xl border border-line-strong bg-canvas-raised p-3 text-fg shadow-popover"
    >
      {children}
    </motion.div>,
    document.body,
  )
}

interface MenuProps<T> {
  anchor: HTMLElement
  options: SelectOption<T>[]
  value: T
  active: number
  listboxId: string
  labelId: string
  onHover: (index: number) => void
  onSelect: (index: number) => void
  onOutside: () => void
  /** Shown beside the list, level with the row `flyoutRow`. */
  flyout?: ReactNode
  flyoutRow?: string
  onFlyoutEscape: () => void
  kral: boolean
}

function Menu<T>({ anchor, options, value, active, listboxId, labelId, onHover, onSelect, onOutside, flyout, flyoutRow, onFlyoutEscape, kral }: MenuProps<T>) {
  const reduced = useReducedMotion()
  const isPresent = useIsPresent()
  const panelRef = useRef<HTMLDivElement>(null)
  const longest = Math.max(...options.map((option) => option.label.length))
  const place = (): ReturnType<typeof computePlace> =>
    computePlace(anchor, Math.max(anchor.offsetWidth, MIN_WIDTH, longest * (kral ? KRAL_CHAR_PX : CHAR_PX) + ROW_EXTRA_PX))
  const [placed, setPlaced] = useState(place)

  useEffect(() => {
    const update = () => setPlaced(place())
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !anchor.contains(target) && !(target as Element).closest?.('[data-select-flyout]')) onOutside()
    }
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      document.removeEventListener('pointerdown', onPointerDown)
    }
    // `place` only reads the anchor.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, onOutside])

  // Keep the highlighted row visible.
  useEffect(() => {
    document.getElementById(`${listboxId}-${active}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [active, listboxId])

  const shift = reduced ? 0 : placed.above ? 4 : -4

  return (
    <>
      {createPortal(
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: shift }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: shift }}
          transition={{ duration: DURATION.state, ease: EASE_OUT }}
          // Keep focus on the trigger while the pointer works the list.
          onPointerDown={(event) => event.preventDefault()}
          style={{
            pointerEvents: isPresent ? undefined : 'none',
            left: placed.left,
            width: placed.width,
            maxHeight: placed.maxHeight,
            top: placed.top,
            bottom: placed.bottom,
          }}
          className={kral ? KRAL_LISTBOX_PANEL : LISTBOX_PANEL}
        >
          <ul id={listboxId} role="listbox" aria-labelledby={labelId} className={LISTBOX_LIST}>
            {options.map((option, index) => {
              const selected = option.value === value
              return (
                <li
                  key={String(option.value)}
                  id={`${listboxId}-${index}`}
                  role="option"
                  aria-selected={selected}
                  onPointerMove={() => index !== active && onHover(index)}
                  onClick={() => onSelect(index)}
                  className={(kral ? kralOptionRow : optionRow)(index === active, selected)}
                >
                  <span className="min-w-0 flex-1 whitespace-nowrap">{option.label}</span>
                  <span className="w-4 shrink-0">{selected && <CheckIcon />}</span>
                  {option.submenu && <ChevronRightIcon className="shrink-0 text-fg-muted" />}
                </li>
              )
            })}
          </ul>
        </motion.div>,
        document.body,
      )}
      {flyout && flyoutRow && (
        <Flyout panel={panelRef} row={flyoutRow} onEscape={onFlyoutEscape}>
          {flyout}
        </Flyout>
      )}
    </>
  )
}

interface SelectProps<T> {
  /** The accessible name (kept visually hidden: the trigger already shows the value). */
  label: string
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  /** Shown before the value on the trigger only, e.g. "Sort: ". */
  triggerPrefix?: string
  className?: string
  /** 'kral' restyles the trigger and list flat and square for the KRAL pages; unset leaves the skeuomorphic control. */
  tone?: 'kral'
}

/** A select-only combobox: a button that opens a listbox. Focus stays on the button throughout. */
export function Select<T extends string | number>({ label, value, options, onChange, triggerPrefix = '', className = '', tone }: SelectProps<T>) {
  const kral = tone === 'kral'
  const listboxId = useId()
  const labelId = useId()
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)
  // Show the pick at once; the parent (here the URL) may take a render or two to hand the new value back.
  // The pick only counts while the parent still holds the value it was made against.
  const [pick, setPick] = useState<{ value: T; from: T } | null>(null)
  // Once the parent holds a different value the pick is spent; otherwise going back to the old value (a reset) would show the stale pick again.
  if (pick && pick.from !== value) setPick(null)
  const shown = pick && pick.from === value ? pick.value : value
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === shown),
  )
  const [active, setActive] = useState(selectedIndex)
  // The row whose submenu is showing beside the list, if any.
  const [sub, setSub] = useState<number | null>(null)
  const typed = useRef({ text: '', timer: 0 })

  const openMenu = () => {
    setActive(selectedIndex)
    setSub(null)
    setOpen(true)
  }
  const close = useCallback(() => {
    setOpen(false)
    setSub(null)
  }, [])
  /** Highlights a row; a submenu stays only beside its own row. */
  const highlight = (index: number) => {
    setActive(index)
    setSub((current) => (current === index ? current : null))
  }

  function choose(index: number) {
    const option = options[index]
    if (option.value !== shown) {
      setPick({ value: option.value, from: value })
      onChange(option.value)
    }
    // An option with a submenu keeps the list open and shows the submenu; the rest close it.
    if (option.submenu) setSub(index)
    else close()
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault()
        openMenu()
      }
      return
    }
    const move = (index: number) => {
      event.preventDefault()
      highlight(Math.min(Math.max(index, 0), options.length - 1))
    }
    switch (event.key) {
      case 'ArrowDown':
        return move(active + 1)
      case 'ArrowUp':
        return move(active - 1)
      case 'Home':
        return move(0)
      case 'End':
        return move(options.length - 1)
      case 'ArrowRight':
        if (!options[active].submenu) return
        event.preventDefault()
        return choose(active)
      case 'Enter':
      case ' ':
        event.preventDefault()
        return choose(active)
      case 'Escape':
        // Closes the list only, not a dialog around it.
        event.preventDefault()
        event.stopPropagation()
        return close()
      case 'Tab':
        return close()
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      window.clearTimeout(typed.current.timer)
      typed.current.text += event.key.toLowerCase()
      typed.current.timer = window.setTimeout(() => (typed.current.text = ''), TYPEAHEAD_MS)
      // A repeated letter cycles through the options that start with it.
      const text = typed.current.text
      const from = text.length === 1 ? active + 1 : active
      const order = [...options.keys()].map((i) => (i + from) % options.length)
      const hit = order.find((i) => options[i].label.toLowerCase().startsWith(text))
      if (hit !== undefined) highlight(hit)
    }
  }

  useEffect(() => () => window.clearTimeout(typed.current.timer), [])

  /** Closes the list and its submenu and puts focus back on the button. */
  function done() {
    close()
    button?.focus()
  }

  return (
    <>
      <span id={labelId} className="sr-only">
        {label}
      </span>
      <button
        ref={setButton}
        type="button"
        role="combobox"
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? `${listboxId}-${active}` : undefined}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        className={`${
          kral
            ? 'kral-focus font-kral-mono flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-none border border-kral-fg bg-transparent px-3 text-base font-medium text-kral-fg uppercase transition-colors duration-150 ease-out hover:bg-kral-fg/10 aria-expanded:bg-kral-fg/10 motion-reduce:transition-none md:text-xs md:tracking-[0.08em]'
            : 'skeuo font-ui flex min-h-9 pointer-coarse:min-h-11 max-md:min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-3 text-sm font-semibold'
        } ${className}`}
      >
        <span className="truncate">
          {/* Dropped on narrow phones so the value fits beside its neighbour; it names itself ("Price: low to high"). */}
          <span className="max-[419px]:hidden">{triggerPrefix}</span>
          {options[selectedIndex]?.summary ?? options[selectedIndex]?.label}
        </span>
        <ChevronDownIcon className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && button && (
          <Menu
            anchor={button}
            options={options}
            value={shown}
            active={active}
            listboxId={listboxId}
            labelId={labelId}
            onHover={highlight}
            onSelect={choose}
            onOutside={close}
            flyout={sub !== null ? options[sub].submenu?.(done) : undefined}
            flyoutRow={sub !== null ? `${listboxId}-${sub}` : undefined}
            onFlyoutEscape={done}
            kral={kral}
          />
        )}
      </AnimatePresence>
    </>
  )
}
