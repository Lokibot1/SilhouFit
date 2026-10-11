import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDebouncedValue } from './useDebouncedValue'

/** The shop search box: local text so typing stays instant, with the debounced text written to `q` in the URL. */
export function useShopSearch() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [search, setSearch] = useState(q)
  const debounced = useDebouncedValue(search)
  // The last q this box wrote or adopted; any other change came from Back/Forward or a clear.
  const knownQ = useRef(q)

  const writeQuery = useEffectEvent((text: string) => {
    if (text === q) return
    knownQ.current = text
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('page')
        if (text) next.set('q', text)
        else next.delete('q')
        return next
      },
      { replace: true },
    )
  })
  useEffect(() => writeQuery(debounced.trim()), [debounced])
  useEffect(() => {
    if (q === knownQ.current) return
    knownQ.current = q
    setSearch(q)
  }, [q])

  return [search, setSearch] as const
}
