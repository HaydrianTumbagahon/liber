import { useEffect } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from './Button.tsx'
import { IconButton } from './IconButton.tsx'

type ToastProps = {
  message: string | null
  onDismiss: () => void
  actionLabel?: string
  onAction?: () => void
}

export function Toast({
  message,
  onDismiss,
  actionLabel,
  onAction,
}: ToastProps) {
  useEffect(() => {
    if (!message) return
    const timeout = window.setTimeout(onDismiss, 3200)
    return () => window.clearTimeout(timeout)
  }, [message, onDismiss])

  if (!message) return null

  return (
    <div className="ui-toast" role="status" aria-live="polite">
      <Check size={17} aria-hidden="true" />
      <span>{message}</span>
      {actionLabel && onAction && (
        <Button type="button" variant="ghost" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
      <IconButton label="Dismiss notification" onClick={onDismiss}>
        <X size={16} aria-hidden="true" />
      </IconButton>
    </div>
  )
}
