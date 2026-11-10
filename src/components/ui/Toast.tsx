import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence } from 'framer-motion'
import { ToastItem } from './ToastItem.tsx'

export type ToastVariant = 'success' | 'info' | 'warning' | 'error'

export type ToastAction = {
  label: string
  onClick: () => void
}

export type ToastOptions = {
  message: string
  variant?: ToastVariant
  action?: ToastAction
  duration?: number
}

type ToastEntry = ToastOptions & { id: number }
type ToastContextValue = { showToast: (options: ToastOptions) => number }

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider.')
  return context.showToast
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const sequence = useRef(0)
  const showToast = useCallback((options: ToastOptions) => {
    sequence.current += 1
    const entry = { ...options, id: sequence.current }
    setToasts((current) => [...current, entry].slice(-3))
    return entry.id
  }, [])
  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="ui-toast-stack" role="region" aria-label="Notifications">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <ToastItem
              key={toast.id}
              {...toast}
              onDismiss={() => dismissToast(toast.id)}
            />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
