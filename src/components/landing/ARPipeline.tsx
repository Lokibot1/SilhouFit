import { CameraIcon, PoseIcon, ScreenIcon } from './ARStageIcons'

const STAGES = [
  { Icon: CameraIcon, label: 'Camera feed' },
  { Icon: PoseIcon, label: 'Pose landmarks' },
  { Icon: ScreenIcon, label: 'Garment render' },
]

export function ARPipeline() {
  return (
    <div className="group flex items-center justify-center gap-2 sm:gap-4">
      {STAGES.map((stage, index) => (
        <div key={stage.label} className="flex items-center gap-2 sm:gap-4">
          <button
            type="button"
            className="flex flex-col items-center gap-3 rounded-xl px-2 py-2 text-ink/70 transition-all duration-200 hover:scale-110 hover:text-bronze focus-visible:scale-110 focus-visible:text-bronze dark:text-bone/70 dark:hover:text-bronze-light dark:focus-visible:text-bronze-light"
          >
            <stage.Icon className="h-12 w-12 sm:h-14 sm:w-14" />
            <span className="font-ui text-xs font-medium sm:text-sm">
              {stage.label}
            </span>
          </button>

          {index < STAGES.length - 1 && (
            <svg
              viewBox="0 0 40 16"
              className="h-4 w-8 shrink-0 text-ink/30 sm:w-10 dark:text-bone/30"
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
      ))}
    </div>
  )
}
