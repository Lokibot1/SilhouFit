import { useEffect, useState } from 'react'
import { fetchMe } from '../service/fetchMe'

/** The signed-in user's id, so an inbox row can say "You:" for their own last message. Undefined until it arrives, or if it cannot be loaded. */
export function useSelfId() {
  const [id, setId] = useState<string>()
  useEffect(() => {
    fetchMe().then(
      (me) => setId(me.id),
      () => {},
    )
  }, [])
  return id
}
