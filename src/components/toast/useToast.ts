import { createContext, useContext } from 'react'

export interface ToastOptions {
  kind: 'success' | 'error' | 'info'
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
