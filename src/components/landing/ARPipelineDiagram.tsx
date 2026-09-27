export function ARPipelineDiagram({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 520 160"
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
    >
      <rect x="16" y="52" width="56" height="56" rx="4" strokeWidth="1.5" />
      <circle cx="44" cy="80" r="14" strokeWidth="1.5" />
      <rect x="14" y="46" width="16" height="10" rx="2" strokeWidth="1.5" />

      <line x1="90" y1="80" x2="170" y2="80" strokeWidth="1.5" />
      <path d="M162 73l8 7-8 7" strokeWidth="1.5" strokeLinecap="round" />

      <g strokeWidth="1.5">
        <circle cx="230" cy="44" r="4" />
        <circle cx="212" cy="70" r="4" />
        <circle cx="248" cy="70" r="4" />
        <circle cx="230" cy="82" r="4" />
        <circle cx="200" cy="112" r="4" />
        <circle cx="260" cy="112" r="4" />
        <line x1="230" y1="48" x2="230" y2="78" />
        <line x1="230" y1="60" x2="212" y2="70" />
        <line x1="230" y1="60" x2="248" y2="70" />
        <line x1="230" y1="86" x2="200" y2="108" />
        <line x1="230" y1="86" x2="260" y2="108" />
      </g>

      <line x1="290" y1="80" x2="370" y2="80" strokeWidth="1.5" />
      <path d="M362 73l8 7-8 7" strokeWidth="1.5" strokeLinecap="round" />

      <rect x="392" y="28" width="112" height="80" rx="4" strokeWidth="1.5" />
      <line x1="392" y1="46" x2="504" y2="46" strokeWidth="1" opacity="0.5" />
      <path
        d="M448 58c6 0 10 5 10 11 0 4-2 8-5 10 7 3 12 9 13 18l2 15H428l2-15c1-9 6-15 13-18-3-2-5-6-5-10 0-6 4-11 10-11Z"
        strokeWidth="1.2"
      />
    </svg>
  )
}
