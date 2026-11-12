import { useState } from 'react'
import type { useCamera } from '../../hooks/useCamera'
import { SpinnerIcon } from '../form/icons'
import { KRAL_BODY } from '../profile/profileKral'
import { KRAL_PRIMARY, KRAL_SECONDARY } from '../shop/shopControls'

const CARD: Record<string, { title: string; body: string; again?: string }> = {
  idle: {
    title: 'Try it on over your camera',
    body: 'Your camera feed stays on this device. Nothing is recorded or uploaded. You can also continue without the camera.',
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

/** The camera consent card and controls over the stage. The tap on "Turn on camera" is the consent; nothing starts before it. */
export function CameraOverlay({ camera }: { camera: ReturnType<typeof useCamera> }) {
  const { state, start, stop } = camera
  const [declined, setDeclined] = useState(false)
  const card = CARD[state]

  if (state === 'starting') {
    return (
      <div role="status" className={`${KRAL_BODY} absolute inset-0 flex items-center justify-center gap-2 bg-kral-bg/60`}>
        <SpinnerIcon size={20} />
        Starting the camera
      </div>
    )
  }

  if (card && !declined) {
    return (
      <div className="absolute inset-x-0 bottom-0 flex justify-center p-4">
        <div role="group" aria-label="Camera" className="max-w-sm border border-kral-rule bg-kral-bg p-4 sm:p-6">
          <h2 className="font-kral-display text-lg leading-[1.05] font-extrabold text-kral-fg uppercase">{card.title}</h2>
          <p className={`${KRAL_BODY} mt-2`}>{card.body}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {card.again && (
              <button type="button" onClick={start} className={KRAL_PRIMARY}>
                {card.again}
              </button>
            )}
            <button type="button" onClick={() => setDeclined(true)} className={KRAL_SECONDARY}>
              Continue without camera
            </button>
          </div>
        </div>
      </div>
    )
  }

  const live = state === 'live'
  return (
    <div className="absolute inset-x-0 bottom-3 flex justify-center">
      <button
        type="button"
        onClick={() => {
          if (live) {
            stop()
            setDeclined(true)
          } else {
            setDeclined(false)
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
