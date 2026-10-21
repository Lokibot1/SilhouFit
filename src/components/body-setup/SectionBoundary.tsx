import { Component, type ReactNode } from 'react'

interface SectionBoundaryProps {
  /** What to show instead of the section once it has crashed. `retry` clears the failure and renders the section again. */
  fallback: (retry: () => void) => ReactNode
  children: ReactNode
}

/** Keeps one section's crash (or a code chunk that would not load) from blanking the page around it. */
export class SectionBoundary extends Component<SectionBoundaryProps, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  retry = () => this.setState({ failed: false })
  render() {
    return this.state.failed ? this.props.fallback(this.retry) : this.props.children
  }
}
