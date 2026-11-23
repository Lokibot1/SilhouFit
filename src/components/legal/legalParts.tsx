import type { ReactNode } from 'react'

export const LEGAL_EMAIL = 'officialkral.23@gmail.com'

export function Bullets({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5">{children}</ul>
}

export function Steps({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-2 pl-5">{children}</ol>
}

export function Lead({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-kral-fg">{children}</span>
}

export function Mail() {
  return <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>
}
