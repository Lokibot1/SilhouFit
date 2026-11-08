import { Component, lazy, Suspense, type ReactNode } from 'react'
import type { ShaderColors } from './ui/ShaderBackground'

const ShaderBackground = lazy(() => import('./ui/ShaderBackground').then((m) => ({ default: m.ShaderBackground })))

const rgb = (hex: number): ShaderColors[number] => [(hex >> 16) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]

// DESIGN.md colours, kept calm so the copy stays at 4.5:1 or better anywhere on the field.
// Dark: Obsidian and Graphite with a deep red band. Light: Paper and Porcelain with a pale red tint.
const DARK = [0x161113, 0x322d2f, 0x4a1219, 0x322d2f, 0x161113].map(rgb)
const LIGHT = [0xfffbfd, 0xeeeced, 0xf3dcdf, 0xeeeced, 0xfffbfd].map(rgb)

// A shader that fails to load or draw must never take the error page down with it, so it gets its own boundary and
// the page falls back to its flat background. Nothing here needs a provider: the theme is read from the document class.
class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/** The login page's animated KRAL shader as a full-screen, non-interactive layer behind the page. */
export function KralErrorBackdrop() {
  const colors = document.documentElement.classList.contains('dark') ? DARK : LIGHT
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
      <Guard>
        <Suspense fallback={null}>
          <ShaderBackground colors={colors} />
        </Suspense>
      </Guard>
    </div>
  )
}
