export function CameraIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <rect x="8" y="20" width="48" height="34" rx="4" strokeWidth="1.5" />
      <circle cx="32" cy="37" r="11" strokeWidth="1.5" />
      <rect x="22" y="12" width="14" height="8" rx="2" strokeWidth="1.5" />
    </svg>
  )
}

export function PoseIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <g strokeWidth="1.5">
        <circle cx="32" cy="12" r="5" />
        <circle cx="16" cy="30" r="5" />
        <circle cx="48" cy="30" r="5" />
        <circle cx="32" cy="36" r="5" />
        <circle cx="22" cy="56" r="5" />
        <circle cx="42" cy="56" r="5" />
        <line x1="32" y1="17" x2="32" y2="31" />
        <line x1="32" y1="24" x2="16" y2="30" />
        <line x1="32" y1="24" x2="48" y2="30" />
        <line x1="32" y1="41" x2="22" y2="51" />
        <line x1="32" y1="41" x2="42" y2="51" />
      </g>
    </svg>
  )
}

export function ScreenIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <rect x="8" y="10" width="48" height="36" rx="3" strokeWidth="1.5" />
      <line x1="8" y1="20" x2="56" y2="20" strokeWidth="1" opacity="0.5" />
      <path
        d="M32 26c3 0 5 2.5 5 5.5 0 2-1 3.8-2.4 4.8 3.4 1.5 5.7 4.4 6.2 8.2l1 5.5H24.2l1-5.5c.5-3.8 2.8-6.7 6.2-8.2C30 35.3 29 33.5 29 31.5c0-3 2-5.5 5-5.5Z"
        strokeWidth="1.2"
      />
      <line x1="20" y1="54" x2="44" y2="54" strokeWidth="1.5" />
      <line x1="32" y1="46" x2="32" y2="54" strokeWidth="1.5" />
    </svg>
  )
}
