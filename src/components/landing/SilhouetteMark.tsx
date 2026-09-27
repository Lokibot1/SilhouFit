export function SilhouetteMark({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 260"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <pattern
        id="measure-grid"
        width="20"
        height="20"
        patternUnits="userSpaceOnUse"
      >
        <path
          d="M0 0H20M0 0V20"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.5"
          opacity="0.35"
        />
      </pattern>
      <rect x="0" y="0" width="200" height="260" fill="url(#measure-grid)" />
      <path
        d="M100 18c14 0 24 11 24 25 0 10-5 18-12 23 16 7 26 21 29 40l7 62c1 8-5 15-13 15H65c-8 0-14-7-13-15l7-62c3-19 13-33 29-40-7-5-12-13-12-23 0-14 10-25 24-25Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M100 66v118M76 96l-8 20M124 96l8 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.6"
      />
    </svg>
  )
}
