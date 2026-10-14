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
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { DURATION, EASE_OUT } from '../../motion/tokens'
import { normalizePlace } from '../../utils/psgcMatch'
import { stripEmoji } from '../../utils/signUpValidation'
import { computePlace, LISTBOX_LIST, LISTBOX_PANEL, optionRow } from '../ui/listbox'
import { AlertIcon, CheckIcon, ChevronDownIcon } from './icons'

const SEARCH_MAX_LENGTH = 40
const SEARCH_DEBOUNCE_MS = 150
const MIN_WIDTH = 240
// Above the Modal (z-[80]) that a select usually sits in.
const MENU_Z = 90

export interface SearchOption {
  value: string
  label: string
}

interface MenuProps {
  anchor: HTMLElement
  options: SearchOption[]
  value: string | null
  noun: string
  label: string
  listboxId: string
  onSelect: (value: string) => void
  onClose: (refocus: boolean) => void
}

function Menu({ anchor, options, value, noun, label, listboxId, onSelect, onClose }: MenuProps) {
  const reduced = useReducedMotion()
  const isPresent = useIsPresent()
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const place = () => computePlace(anchor, Math.max(anchor.offsetWidth, MIN_WIDTH), 0)
  const [placed, setPlaced] = useState(place)
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)

  const indexed = useMemo(() => options.map((option) => ({ option, key: normalizePlace(option.label) })), [options])
  const results = useMemo(() => {
    const wanted = normalizePlace(debounced) || debounced.trim().toLowerCase()
    return wanted ? indexed.filter((item) => item.key.includes(wanted)).map((item) => item.option) : options
  }, [debounced, indexed, options])

  // The highlighted option resets to the top result whenever the filter changes.
  const [activeValue, setActiveValue] = useState<string | undefined>(value ?? undefined)
  const [activeFor, setActiveFor] = useState(debounced)
  if (activeFor !== debounced) {
    setActiveFor(debounced)
    setActiveValue(undefined)
  }
  const activeIndex = Math.max(0, results.findIndex((option) => option.value === activeValue))
  const active = results[activeIndex]
  const optionId = (option: SearchOption) => `${listboxId}-${option.value}`

  useEffect(() => {
    panelRef.current?.querySelector('input')?.focus()
  }, [])

  useEffect(() => {
    const update = () => setPlaced(place())
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
    // `place` only reads the anchor.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, onClose])

  // Keep the highlighted row visible (this also scrolls the selected option into view on open).
  useEffect(() => {
    const list = listRef.current
    const row = active ? document.getElementById(optionId(active)) : null
    if (!list || !row) return
    if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.value])

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    const move = (index: number) => {
      event.preventDefault()
      if (results.length) setActiveValue(results[Math.min(Math.max(index, 0), results.length - 1)].value)
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
        if (active) onSelect(active.value)
        return
      // The dialog around this menu traps Tab and closes on Escape with a document listener; stopping the event here
      // keeps both of them out of it, so Escape closes the list only and Tab leaves it without moving the trap.
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        return onClose(true)
      case 'Tab':
        event.preventDefault()
        event.stopPropagation()
        return onClose(true)
    }
  }

  const empty = results.length === 0
  const shift = reduced ? 0 : placed.above ? 4 : -4

  return createPortal(
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, y: shift }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: shift }}
      transition={{ duration: DURATION.state, ease: EASE_OUT }}
      style={{
        zIndex: MENU_Z,
        pointerEvents: isPresent ? undefined : 'none',
        left: placed.left,
        width: placed.width,
        maxHeight: placed.maxHeight,
        top: placed.top,
        bottom: placed.bottom,
      }}
      className={LISTBOX_PANEL}
    >
      <input
        type="text"
        role="combobox"
        aria-label={`Search ${noun}`}
        aria-expanded="true"
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={active ? optionId(active) : undefined}
        value={query}
        onChange={(event) => setQuery(stripEmoji(event.target.value).slice(0, SEARCH_MAX_LENGTH))}
        onKeyDown={onKeyDown}
        placeholder={`Search ${noun}`}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        className="h-11 shrink-0 border-b border-line bg-transparent px-3 text-base text-fg outline-none placeholder:text-fg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-chrome-strong"
      />
      <ul ref={listRef} id={listboxId} role="listbox" aria-label={label} hidden={empty} className={LISTBOX_LIST}>
        {results.map((option) => {
          const selected = option.value === value
          return (
            <li
              key={option.value}
              id={optionId(option)}
              role="option"
              aria-selected={selected}
              onPointerMove={() => option.value !== active?.value && setActiveValue(option.value)}
              onClick={() => onSelect(option.value)}
              className={optionRow(option.value === active?.value, selected)}
            >
              <span className="min-w-0 flex-1">{option.label}</span>
              <span className="w-4 shrink-0">{selected && <CheckIcon />}</span>
            </li>
          )
        })}
      </ul>
      {empty && (
        <p role="status" className="px-3 py-4 text-base leading-snug text-fg-muted">
          {`No ${noun} match "${debounced.trim()}". Check the spelling or clear the search.`}
        </p>
      )}
    </motion.div>,
    document.body,
  )
}

interface SearchSelectProps {
  id: string
  label: string
  /** Plural, for the search box and the empty message: "barangays". */
  noun: string
  options: SearchOption[]
  value: string | null
  /** Shown while `value` is not (or not yet) in `options`. */
  selectedLabel?: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  error?: string
  /** The list was closed, with or without a choice: the moment to start showing this field's error. */
  onDone?: () => void
}

/** A labelled picker that opens a searchable listbox. Sits above dialogs and keeps Tab and Escape to itself. */
export function SearchSelect({
  id,
  label,
  noun,
  options,
  value,
  selectedLabel,
  onChange,
  placeholder = 'Select',
  disabled,
  error,
  onDone,
}: SearchSelectProps) {
  const listboxId = useId()
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)
  const shown = options.find((option) => option.value === value)?.label ?? selectedLabel
  const errorId = `${id}-error`
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  })

  // Stable identity: the menu re-subscribes its document listeners whenever this changes.
  const close = useCallback(
    (refocus: boolean) => {
      setOpen(false)
      doneRef.current?.()
      if (refocus) button?.focus()
    },
    [button],
  )

  return (
    <div>
      <span id={`${id}-label`} className="font-ui mb-1 block text-sm text-fg-muted">
        {label}
      </span>
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
        aria-labelledby={`${id}-label ${id}-value`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`skeuo font-ui flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-3 text-left text-base disabled:cursor-not-allowed disabled:opacity-100! ${
          error ? 'outline outline-2 outline-danger' : ''
        }`}
      >
        <span id={`${id}-value`} className={`min-w-0 flex-1 truncate ${shown ? 'text-fg' : 'text-fg-muted'}`}>
          {shown ?? placeholder}
        </span>
        <ChevronDownIcon className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 px-1 pt-1 text-xs leading-snug text-danger">
          <AlertIcon className="mt-px size-3.5" />
          <span>{error}</span>
        </p>
      )}
      <AnimatePresence>
        {open && button && (
          <Menu
            anchor={button}
            options={options}
            value={value}
            noun={noun}
            label={label}
            listboxId={listboxId}
            onSelect={(next) => {
              onChange(next)
              close(true)
            }}
            onClose={close}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
