import { useEffect, useRef, useState } from 'react'
import type { TouchEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { AlertCircle, AlertTriangle, Check, Info, X } from 'lucide-react'
import { Button } from './Button.tsx'
import { IconButton } from './IconButton.tsx'
import { resolveMotionPreset } from '../../lib/motion.ts'
import type { MotionPresetName } from '../../lib/motion.ts'
import type { ToastOptions } from './Toast.tsx'

type ToastItemProps = ToastOptions & {
  onDismiss: () => void
}

const toastIcons = {
  success: Check,
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
} as const

export function ToastItem({
  message,
  detail,
  variant = 'info',
  action,
  duration = 4000,
  onDismiss,
}: ToastItemProps) {
  const reduceMotion = useReducedMotion()
  const [paused, setPaused] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const onDismissRef = useRef(onDismiss)
  const Icon = toastIcons[variant]
  const presetName: Extract<MotionPresetName, 'slideDown' | 'slideUp'> =
    typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 48rem)').matches
      ? 'slideDown'
      : 'slideUp'
  const animation = resolveMotionPreset(presetName, Boolean(reduceMotion))
  const remainingMs = useRef(duration)

  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    if (paused) return
    const startedAt = performance.now()
    const timeout = window.setTimeout(
      () => onDismissRef.current(),
      remainingMs.current,
    )
    return () => {
      window.clearTimeout(timeout)
      remainingMs.current = Math.max(
        0,
        remainingMs.current - (performance.now() - startedAt),
      )
    }
  }, [duration, paused])

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null
  }

  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const startX = touchStartX.current
    touchStartX.current = null
    const endX = event.changedTouches[0]?.clientX
    if (startX !== null && endX !== undefined && Math.abs(endX - startX) > 48) {
      onDismiss()
    }
  }

  return (
    <motion.article
      layout
      className={`ui-toast ui-toast--${variant}`}
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      data-paused={paused}
      variants={animation.variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={animation.transition}
      style={{ '--toast-duration': `${duration}ms` } as React.CSSProperties}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setPaused(false)
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={onDismiss}
    >
      <Icon size={17} aria-hidden="true" />
      <span className="ui-toast__copy">
        <span className="ui-toast__message">{message}</span>
        {detail && <small className="ui-toast__detail">{detail}</small>}
      </span>
      {action && (
        <Button
          type="button"
          variant="ghost"
          onClick={(event) => {
            event.stopPropagation()
            action.onClick()
            onDismiss()
          }}
        >
          {action.label}
        </Button>
      )}
      <IconButton
        label="Dismiss notification"
        onClick={(event) => {
          event.stopPropagation()
          onDismiss()
        }}
      >
        <X size={16} aria-hidden="true" />
      </IconButton>
      <span className="ui-toast__progress" aria-hidden="true" />
    </motion.article>
  )
}
