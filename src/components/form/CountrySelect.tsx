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
import { computePlace, KRAL_LISTBOX_PANEL, kralOptionRow, LISTBOX_LIST, LISTBOX_PANEL, optionRow } from '../ui/listbox'
import { CheckIcon, ChevronDownIcon } from './icons'

const SEARCH_MAX_LENGTH = 40
const SEARCH_DEBOUNCE_MS = 150
const MENU_WIDTH = 320
const EDGE = 8

interface MenuProps {
  anchor: HTMLElement
  value: string
  listboxId: string
  onSelect: (code: string) => void
  onClose: (refocus: boolean) => void
  kral: boolean
}

function CountryMenu({ anchor, value, listboxId, onSelect, onClose, kral }: MenuProps) {
  const reduced = useReducedMotion()
  const isPresent = useIsPresent()
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [place, setPlace] = useState(() => computePlace(anchor, MENU_WIDTH, EDGE))
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
    const update = () => setPlace(computePlace(anchor, MENU_WIDTH, EDGE))
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
      className={kral ? KRAL_LISTBOX_PANEL : LISTBOX_PANEL}
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
        className={`h-11 shrink-0 border-b bg-transparent px-3 text-base outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 ${
          kral
            ? 'font-kral-mono border-kral-rule text-kral-fg placeholder:text-kral-muted focus-visible:outline-kral-red-ink'
            : 'border-line text-fg placeholder:text-fg-muted focus-visible:outline-chrome-strong'
        }`}
      />
      <ul
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label="Countries"
        hidden={empty}
        className={LISTBOX_LIST}
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
              className={(kral ? kralOptionRow : optionRow)(country.code === active?.code, selected)}
            >
              <span className="min-w-0 flex-1 truncate">{country.name}</span>
              <span className={`shrink-0 text-sm tabular-nums ${kral ? 'font-kral-mono text-kral-muted' : 'font-ui text-fg-muted'}`}>
                {country.code} {country.dial}
              </span>
              <span className="w-4 shrink-0">{selected && <CheckIcon />}</span>
            </li>
          )
        })}
      </ul>
      {empty && (
        <p role="status" className={`px-3 py-4 text-base leading-snug ${kral ? 'font-kral-mono text-kral-muted' : 'text-fg-muted'}`}>
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
  /** 'kral' sets the picker and its list flat and square for the KRAL pages. */
  tone?: 'kral'
}

/** Calling-code picker: a button that opens a searchable listbox of every country. */
export function CountrySelect({ id, value, onChange, disabled, tone }: CountrySelectProps) {
  const kral = tone === 'kral'
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
        className={`relative flex h-8 w-22 cursor-pointer items-center justify-center gap-1 px-2 text-sm after:absolute after:inset-x-0 after:-inset-y-[7px] after:content-[''] disabled:cursor-progress ${
          kral
            ? 'kral-focus font-kral-mono bg-kral-fg/10 text-kral-fg transition-colors duration-150 ease-out hover:bg-kral-fg/20 motion-reduce:transition-none'
            : 'skeuo font-ui rounded-md'
        }`}
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
            kral={kral}
          />
        )}
      </AnimatePresence>
    </>
  )
}
