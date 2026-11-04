const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

/** Stands in for ChatThread while it loads: the same header, list and composer heights, so nothing shifts on swap. */
export function ChatSkeleton() {
  return (
    <div role="status" aria-label="Loading conversation" className="flex min-h-0 flex-1 animate-pulse flex-col">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-3">
        <Bar className="h-6 w-40" />
      </div>
      <div className="grid min-h-0 flex-1 content-end gap-3 overflow-hidden px-3 py-4 sm:px-4">
        <div className="flex items-end gap-2">
          <div className="size-8 shrink-0 rounded-full bg-line-strong" />
          <Bar className="h-14 w-3/5" />
        </div>
        <div className="flex justify-end">
          <Bar className="h-10 w-2/5 bg-line-strong" />
        </div>
        <div className="flex items-end gap-2">
          <div className="size-8 shrink-0 rounded-full bg-line-strong" />
          <Bar className="h-10 w-1/2" />
        </div>
      </div>
      <div className="border-t border-line p-3">
        <Bar className="h-11 w-full" />
        <div className="mt-1 h-4" />
      </div>
    </div>
  )
}

/** The inbox rows while they load. */
export function InboxSkeleton() {
  return (
    <ul role="status" aria-label="Loading conversations" className="animate-pulse">
      {Array.from({ length: 6 }, (_, n) => (
        <li key={n} className="flex min-h-16 items-center gap-3 px-3 py-2">
          <div className="size-10 shrink-0 rounded-full bg-line-strong" />
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Bar className="h-4 w-2/3" />
            <Bar className="h-4 w-1/2" />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** The customer's messages page while its code loads. */
export function MessagesPageSkeleton() {
  return (
    <div className="mx-auto flex h-svh max-w-3xl flex-col px-3 pt-[calc(5rem+env(safe-area-inset-top))] pb-3 sm:px-6 sm:pb-6">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-canvas-sub">
        <ChatSkeleton />
      </div>
    </div>
  )
}

/** The staff inbox page while its code loads: the inbox rows beside an empty thread pane. */
export function StaffMessagesPageSkeleton() {
  return (
    <div className="grid h-[calc(100svh-5.5rem)] overflow-hidden rounded-xl border border-line bg-canvas-sub lg:h-[calc(100svh-6.5rem)] lg:grid-cols-[22rem_minmax(0,1fr)]">
      <div className="min-h-0 overflow-hidden p-2 lg:border-r lg:border-line">
        <InboxSkeleton />
      </div>
      <div className="hidden lg:block" />
    </div>
  )
}
