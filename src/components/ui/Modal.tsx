import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { KeyboardEvent, ReactNode } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './IconButton.tsx'
import { resolveMotionPreset } from '../../lib/motion.ts'
import type { MotionPresetName } from '../../lib/motion.ts'
import { motionDurations, motionEasings } from '../../lib/motion.ts'
import { useLenisLock } from '../../lib/LenisProvider.tsx'

export type ModalProps = {
  open: boolean
  title: string
  onOpenChange: (open: boolean) => void
  children: ReactNode
  className?: string
  layoutId?: string
  themePreview?: 'light' | 'dark'
  motionPreset?: Exclude<
    MotionPresetName,
    'press' | 'listItem' | 'listContainer' | 'pageTransition'
  >
}

export function Modal({
  open,
  title,
  onOpenChange,
  children,
  className = '',
  layoutId,
  themePreview,
  motionPreset = 'popIn',
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const reduceMotion = useReducedMotion()
  const acquireLenisLock = useLenisLock()
  const animation = resolveMotionPreset(motionPreset, Boolean(reduceMotion))
  const backdropAnimation = resolveMotionPreset('fade', Boolean(reduceMotion))
  const initialScale =
    motionPreset === 'springBounce' ? 0.97 : motionPreset === 'popIn' ? 0.98 : 1

  useEffect(() => {
    if (!open) return

    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const releaseLenis = acquireLenisLock()
    const frame = window.requestAnimationFrame(() => {
      const focusable = modalRef.current?.querySelector<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), [role="slider"]:not([aria-disabled="true"]), [tabindex]:not([tabindex="-1"])',
      )
      ;(focusable ?? modalRef.current)?.focus()
    })

    return () => {
      window.cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      releaseLenis()
      const target = previouslyFocused.current
      if (target?.isConnected)
        window.requestAnimationFrame(() => target.focus())
      previouslyFocused.current = null
    }
  }, [acquireLenisLock, open])

  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onOpenChange(false)
      return
    }
    if (event.key !== 'Tab') return

    const focusable = Array.from(
      modalRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), [role="slider"]:not([aria-disabled="true"]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter(
      (element) => element.tabIndex >= 0 && element.getClientRects().length > 0,
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first || !last) {
      event.preventDefault()
      modalRef.current?.focus()
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="ui-modal-backdrop"
          data-lenis-prevent
          variants={backdropAnimation.variants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={backdropAnimation.transition}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onOpenChange(false)
          }}
        >
          <motion.div
            className={`ui-modal-frame ${className}`.trim()}
            layoutId={reduceMotion ? undefined : layoutId}
            transition={{
              duration: reduceMotion ? 0 : motionDurations.slow,
              ease: motionEasings.standard,
            }}
          >
            <motion.div
              ref={modalRef}
              className="ui-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              data-theme-preview={themePreview}
              tabIndex={-1}
              initial={{
                opacity: 0,
                ...(reduceMotion ? {} : { scale: initialScale }),
              }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.99 }}
              transition={animation.transition}
              onKeyDown={trapFocus}
            >
              <header className="ui-modal__header">
                <h2 id={titleId} className="ui-modal__title">
                  {title}
                </h2>
                <IconButton
                  label="Close dialog"
                  onClick={() => onOpenChange(false)}
                  type="button"
                >
                  <X size={18} aria-hidden="true" />
                </IconButton>
              </header>
              <div className="ui-modal__body">{children}</div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
