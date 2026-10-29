import { Component, type ReactNode } from 'react'
import { ServerErrorPage } from '../views/public/ServerErrorPage'

interface Props {
  children: ReactNode
  /** The boundary clears itself when this changes, so navigating away from a crashed page works. */
  resetKey: string
}

// Catches render crashes below the routes and shows the 500 page. The error is logged to the console only, never shown.
export class RouteErrorBoundary extends Component<Props, { failed: boolean; resetKey: string }> {
  state = { failed: false, resetKey: this.props.resetKey }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  static getDerivedStateFromProps(props: Props, state: { failed: boolean; resetKey: string }) {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey }
  }

  componentDidCatch(error: unknown) {
    console.error('Render crash caught by RouteErrorBoundary', error)
  }

  render() {
    return this.state.failed ? <ServerErrorPage /> : this.props.children
  }
}
