/** A category name with its piece count beside it, in the accessible name too. */
export function CategoryLabel({ name, count }: { name: string; count?: number }) {
  return (
    <span className="relative inline-flex items-baseline gap-1.5">
      <span>{name}</span>
      {count !== undefined && (
        <>
          <span className="sr-only">
            , {count} {count === 1 ? 'piece' : 'pieces'}
          </span>
          <span aria-hidden="true" className="tabular-nums before:content-['('] after:content-[')']">
            {count}
          </span>
        </>
      )}
    </span>
  )
}
