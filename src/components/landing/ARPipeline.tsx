import { CameraIcon, PoseIcon, ScreenIcon } from './ARStageIcons'

const STAGES = [
  { Icon: CameraIcon, label: 'Camera feed' },
  { Icon: PoseIcon, label: 'Pose landmarks' },
  { Icon: ScreenIcon, label: 'Garment render' },
]

/**
 * Doubles as the readout for the pinned acquisition: `activeIndex` is the stage
 * the scroll position has reached, so the diagram reports where the figure is
 * in the pipeline instead of sitting there as a static illustration.
 */
export function ARPipeline({ activeIndex }: { activeIndex?: number }) {
  return (
    <div className="group flex items-center justify-center gap-1 sm:gap-4">
      {STAGES.map((stage, index) => {
        const isActive = activeIndex === index
        const isDone = activeIndex !== undefined && index < activeIndex

        return (
          <div key={stage.label} className="flex min-w-0 items-center gap-1 sm:gap-4">
            <button
              type="button"
              aria-current={isActive ? 'step' : undefined}
              className={`flex min-w-0 flex-col items-center gap-2 rounded-xl px-1 py-2 sm:gap-3 sm:px-2 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-110 hover:text-chrome-strong focus-visible:scale-110 focus-visible:text-chrome-strong ${
                isActive
                  ? 'scale-110 text-chrome-strong'
                  : isDone
                    ? 'text-fg-muted'
                    : 'text-fg-muted'
              }`}
            >
              <stage.Icon className="h-10 w-10 sm:h-14 sm:w-14" />
              <span className="font-ui text-center text-xs leading-tight font-medium sm:text-sm">
                {stage.label}
              </span>
            </button>

            {index < STAGES.length - 1 && (
              <svg
                viewBox="0 0 40 16"
                className={`h-4 w-5 shrink-0 transition-colors duration-300 sm:w-10 ${
                  activeIndex !== undefined && index < activeIndex
                    ? 'text-chrome-strong'
                    : 'text-fg/30'
                }`}
                fill="none"
                stroke="currentColor"
                aria-hidden="true"
              >
                <line
                  x1="2"
                  y1="8"
                  x2="30"
                  y2="8"
                  strokeWidth="1.5"
                  strokeDasharray="5 4"
                  className="flow-line"
                />
                <path
                  d="M24 3l8 5-8 5"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        )
      })}
    </div>
  )
}
