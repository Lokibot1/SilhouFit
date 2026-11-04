import type { ConnectionState } from '../../hooks/useChatRealtime'
import { SpinnerIcon } from '../form/icons'

/** A thin non-blocking bar while the live connection is down. Sending and reading still work over the normal requests. */
export function ConnectionStatus({ connection }: { connection: ConnectionState }) {
  if (connection !== 'reconnecting') return null
  return (
    <div role="status" data-testid="chat-reconnecting" className="font-ui flex items-center gap-2 border-b border-line bg-warning/15 px-3 py-1.5 text-sm text-fg">
      <SpinnerIcon />
      Reconnecting…
    </div>
  )
}
