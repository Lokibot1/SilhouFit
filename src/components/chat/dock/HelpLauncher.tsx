import { HELP_BOX, openChat } from '../../../service/chatDock'
import { InfoIcon } from '../../form/icons'
import { Tooltip } from '../../ui/Tooltip'

/** The round button that opens the "KRAL Help" box. Once the box exists (open or minimized), its head takes this button's place. */
export function HelpLauncher() {
  return (
    <Tooltip label="Ask KRAL Help">
      <button
        type="button"
        onClick={() => openChat(HELP_BOX, { name: 'KRAL Help' })}
        aria-label="Ask KRAL Help"
        className="flex size-12 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-canvas-raised text-fg shadow-popover hover:bg-fg/10"
      >
        <InfoIcon size={20} />
      </button>
    </Tooltip>
  )
}
