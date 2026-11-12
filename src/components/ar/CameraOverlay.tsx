import type { useCamera } from '../../hooks/useCamera'
import { SpinnerIcon } from '../form/icons'
import { KRAL_BODY } from '../profile/profileKral'
import { KRAL_PRIMARY, KRAL_SECONDARY } from '../shop/shopControls'

const CARD: Record<string, { title: string; body: string; note?: string; again?: string }> = {
  idle: {
    title: 'Try it on over your camera',
    body: 'Your camera feed stays on this device. Nothing is recorded or uploaded. You can also continue without the camera.',
    note: 'Body tracking runs on this device. The first time, it downloads about 20 MB of tracking files.',
    again: 'Turn on camera',
  },
  denied: {
    title: 'Camera access is blocked',
    body: 'Your browser did not allow the camera. Allow camera access for this site in your browser settings, then try again.',
    again: 'Try again',
  },
  'no-camera': {
    title: 'No camera found',
    body: 'This device has no camera we can use. Connect one and try again, or continue without it.',
    again: 'Try again',
  },
  'in-use': {
    title: 'The camera is busy',
    body: 'Another app or tab is using it. Close that, then try again, or continue without it.',
    again: 'Try again',
  },
  unsupported: {
    title: 'The camera needs a secure connection',
    body: 'Your browser only allows the camera on a secure (https) page. Open SilhouFit that way to use it, or continue without it.',
  },
  error: {
    title: "The camera didn't start",
    body: 'Something went wrong while starting it. Try again, or continue without it.',
    again: 'Try again',
  },
}

interface CameraPartProps {
  camera: ReturnType<typeof useCamera>
  /** The customer chose to continue without the camera: the card stays away until they turn it on. */
  declined: boolean
  onDeclinedChange: (declined: boolean) => void
}

const cardShown = (state: string, declined: boolean) => state !== 'starting' && !!CARD[state] && !declined

/**
 * The camera consent card. The tap on "Turn on camera" is the consent; nothing starts before it. It sits under the stage in the page flow on
 * narrow screens so it never covers the shirt, and over the bottom of a tall stage from lg up (its parent is the positioned box).
 */
export function CameraCard({ camera, declined, onDeclinedChange }: CameraPartProps) {
  const { state, start } = camera
  const card = CARD[state]
  if (!cardShown(state, declined)) return null
  return (
    <div className="flex justify-center lg:absolute lg:inset-x-0 lg:bottom-0 lg:p-4">
      <div role="group" aria-label="Camera" className="w-full border border-kral-rule bg-kral-bg p-4 sm:p-6 lg:max-w-sm">
        <h2 className="font-kral-display text-lg leading-[1.05] font-extrabold text-kral-fg uppercase">{card.title}</h2>
        <p className={`${KRAL_BODY} mt-2`}>{card.body}</p>
        {card.note && <p className={`${KRAL_BODY} mt-2`}>{card.note}</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          {card.again && (
            <button type="button" onClick={start} className={KRAL_PRIMARY}>
              {card.again}
            </button>
          )}
          <button type="button" onClick={() => onDeclinedChange(true)} className={`${KRAL_SECONDARY} max-w-full whitespace-normal! text-center`}>
            Continue without camera
          </button>
        </div>
      </div>
    </div>
  )
}

/** What sits on the stage itself: the starting spinner and the camera on/off button. */
export function CameraStageControls({ camera, declined, onDeclinedChange }: CameraPartProps) {
  const { state, start, stop } = camera

  if (state === 'starting') {
    return (
      <div role="status" className={`${KRAL_BODY} absolute inset-0 flex items-center justify-center gap-2 bg-kral-bg/60`}>
        <SpinnerIcon size={20} />
        Starting the camera
      </div>
    )
  }

  // While the card is up it carries the button, so the stage stays clear of it.
  if (cardShown(state, declined)) return null

  const live = state === 'live'
  return (
    <div className="absolute inset-x-0 bottom-3 flex justify-center">
      <button
        type="button"
        onClick={() => {
          if (live) {
            stop()
            onDeclinedChange(true)
          } else {
            onDeclinedChange(false)
            void start()
          }
        }}
        className={`${KRAL_SECONDARY} bg-kral-bg/85 backdrop-blur-sm`}
      >
        {live ? 'Turn camera off' : state === 'paused' ? 'Turn camera back on' : 'Turn on camera'}
      </button>
    </div>
  )
}
