import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { COUNTRIES, findCountry } from '../../data/countries'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { DURATION, EASE_OUT } from '../../motion/tokens'
import { searchCountries } from '../../utils/countrySearch'
import { stripEmoji } from '../../utils/signUpValidation'
import { CheckIcon, ChevronDownIcon } from './icons'

const SEARCH_MAX_LENGTH = 40
const SEARCH_DEBOUNCE_MS = 150
const MENU_MAX_HEIGHT = 360
const MENU_WIDTH = 320
const EDGE = 8

interface Place {
  left: number
  width: number
  maxHeight: number
  top?: number
  bottom?: number
  above: boolean
}

// Fixed to the viewport (rendered in a portal) so no ancestor can clip it and the page never grows.
function computePlace(anchor: HTMLElement): Place {
  const rect = anchor.getBoundingClientRect()
  const width = Math.min(MENU_WIDTH, window.innerWidth - EDGE * 2)
  const left = Math.min(Math.max(EDGE, rect.left - EDGE), window.innerWidth - width - EDGE)
  const below = window.innerHeight - rect.bottom - EDGE - 4
  const above = rect.top - EDGE - 4
  if (below >= 240 || below >= above) {
    return { left, width, top: rect.bottom + 4, maxHeight: Math.min(MENU_MAX_HEIGHT, below), above: false }
  }
  return {
    left,
    width,
    bottom: window.innerHeight - rect.top + 4,
    maxHeight: Math.min(MENU_MAX_HEIGHT, above),
    above: true,
  }
}

interface MenuProps {
  anchor: HTMLElement
  value: string
  listboxId: string
  onSelect: (code: string) => void
  onClose: (refocus: boolean) => void
}

function CountryMenu({ anchor, value, listboxId, onSelect, onClose }: MenuProps) {
  const reduced = useReducedMotion()
  const isPresent = useIsPresent()
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [place, setPlace] = useState(() => computePlace(anchor))
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)
  const results = useMemo(() => searchCountries(debounced), [debounced])

  // The highlighted option resets to the top result whenever the filter changes.
  const [activeCode, setActiveCode] = useState<string | undefined>(value)
  const [activeFor, setActiveFor] = useState(debounced)
  if (activeFor !== debounced) {
    setActiveFor(debounced)
    setActiveCode(undefined)
  }
  const activeIndex = Math.max(0, results.findIndex((country) => country.code === activeCode))
  const active = results[activeIndex]
  const activeOptionId = active ? `${listboxId}-${active.code}` : undefined

  useEffect(() => {
    panelRef.current?.querySelector('input')?.focus()
  }, [])

  useEffect(() => {
    const update = () => setPlace(computePlace(anchor))
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !anchor.contains(target)) onClose(false)
    }
    window.addEventListener('resize', update)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('resize', update)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [anchor, onClose])

  // Keep the highlighted row visible (this also scrolls the selected country into view on open).
  useEffect(() => {
    const list = listRef.current
    const row = activeOptionId ? document.getElementById(activeOptionId) : null
    if (!list || !row) return
    if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight
    }
  }, [activeOptionId])

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    const move = (index: number) => {
      event.preventDefault()
      if (results.length) setActiveCode(results[Math.min(Math.max(index, 0), results.length - 1)].code)
    }
    switch (event.key) {
      case 'ArrowDown':
        return move(activeIndex + 1)
      case 'ArrowUp':
        return move(activeIndex - 1)
      case 'Home':
        return move(0)
      case 'End':
        return move(results.length - 1)
      case 'Enter':
        event.preventDefault()
        if (active) onSelect(active.code)
        return
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        return onClose(true)
      case 'Tab':
        event.preventDefault()
        return onClose(true)
    }
  }

  const empty = results.length === 0
  const shift = reduced ? 0 : place.above ? 4 : -4

  return createPortal(
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, y: shift }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: shift }}
      transition={{ duration: DURATION.state, ease: EASE_OUT }}
      style={{
        pointerEvents: isPresent ? undefined : 'none',
        left: place.left,
        width: place.width,
        maxHeight: place.maxHeight,
        top: place.top,
        bottom: place.bottom,
      }}
      className="fixed z-[70] flex flex-col overflow-hidden rounded-xl border border-line-strong bg-canvas text-fg shadow-[0_18px_36px_-12px_rgb(var(--shadow-key)/var(--shadow-b))]"
    >
      <input
        type="text"
        role="combobox"
        aria-label="Search countries"
        aria-expanded="true"
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeOptionId}
        value={query}
        onChange={(event) => setQuery(stripEmoji(event.target.value).slice(0, SEARCH_MAX_LENGTH))}
        onKeyDown={onKeyDown}
        placeholder="Search country or code"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        className="h-11 shrink-0 border-b border-line bg-transparent px-3 text-base text-fg outline-none placeholder:text-fg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-chrome-strong"
      />
      <ul
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label="Countries"
        hidden={empty}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain py-1"
      >
        {results.map((country) => {
          const selected = country.code === value
          return (
            <li
              key={country.code}
              id={`${listboxId}-${country.code}`}
              role="option"
              aria-selected={selected}
              onPointerMove={() => country.code !== active?.code && setActiveCode(country.code)}
              onClick={() => onSelect(country.code)}
              className={`flex min-h-11 cursor-pointer items-center gap-2 px-3 text-base ${
                country.code === active?.code ? 'bg-fg/10' : ''
              } ${selected ? 'font-semibold' : ''}`}
            >
              <span className="min-w-0 flex-1 truncate">{country.name}</span>
              <span className="font-ui shrink-0 text-sm text-fg-muted tabular-nums">
                {country.code} {country.dial}
              </span>
              <span className="w-4 shrink-0">{selected && <CheckIcon />}</span>
            </li>
          )
        })}
      </ul>
      {empty && (
        <p role="status" className="px-3 py-4 text-base leading-snug text-fg-muted">
          {`No countries match "${debounced.trim()}". Try a different name or code, or clear the search.`}
        </p>
      )}
    </motion.div>,
    document.body,
  )
}

interface CountrySelectProps {
  id: string
  /** ISO 3166-1 alpha-2 code. */
  value: string
  onChange: (code: string) => void
  disabled?: boolean
}

/** Calling-code picker: a button that opens a searchable listbox of every country. */
export function CountrySelect({ id, value, onChange, disabled }: CountrySelectProps) {
  const listboxId = useId()
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)
  const country = findCountry(value) ?? COUNTRIES[0]

  // Stable identity: the menu re-subscribes its document listeners whenever this changes.
  const close = useCallback((refocus: boolean) => {
    setOpen(false)
    if (refocus) button?.focus()
  }, [button])

  return (
    <>
      <button
        ref={setButton}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((isOpen) => !isOpen)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={`Country calling code: ${country.name} ${country.dial}`}
        className="font-ui relative flex h-8 w-22 items-center justify-center gap-1 rounded-lg border border-line-strong px-2 text-sm text-fg transition-colors duration-200 after:absolute after:inset-x-0 after:-inset-y-[7px] after:content-[''] hover:border-fg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chrome-strong disabled:cursor-progress disabled:opacity-70"
      >
        <span>{country.code}</span>
        <span className="tabular-nums">{country.dial}</span>
        <ChevronDownIcon className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && button && (
          <CountryMenu
            anchor={button}
            value={country.code}
            listboxId={listboxId}
            onSelect={(code) => {
              onChange(code)
              close(true)
            }}
            onClose={close}
          />
        )}
      </AnimatePresence>
    </>
  )
}
