import { formatPlacedAt } from '../../../utils/format'

export function PlacedAt({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} className="whitespace-nowrap">
      {formatPlacedAt(iso)}
    </time>
  )
}
