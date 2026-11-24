import { createContext, useContext } from 'react'
import type { Tone } from '../../utils/notifications'

export interface ToastOptions {
  kind: 'success' | 'error' | 'info'
  /** Bold line above the message. */
  title?: string
  /** Adds an accent bar and a matching icon; without it the toast looks as it always did. */
  tone?: Tone
  message: string
  action?: { label: string; onClick: () => void }
}

export interface ToastApi {
  show: (toast: ToastOptions) => void
  dismiss: () => void
}

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside ToastProvider')
  return api
}
