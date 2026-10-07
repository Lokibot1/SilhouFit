import { useEffect } from 'react'

export function useMetaDescription(content: string) {
  useEffect(() => {
    let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const created = !tag
    const previous = tag?.content ?? ''
    if (!tag) {
      tag = document.createElement('meta')
      tag.name = 'description'
      document.head.appendChild(tag)
    }
    tag.content = content

    return () => {
      if (created) tag.remove()
      else tag.content = previous
    }
  }, [content])
}
