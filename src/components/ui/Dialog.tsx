import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from './Button.tsx'
import { IconButton } from './IconButton.tsx'

type DialogProps = {
  open: boolean
  title: string
  onOpenChange: (open: boolean) => void
  children: ReactNode
  className?: string
}

export function Dialog({
  open,
  title,
  onOpenChange,
  children,
  className = '',
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className={`ui-dialog ${className}`.trim()}
      aria-labelledby={titleId}
      onClose={() => {
        if (open) onOpenChange(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onOpenChange(false)
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false)
      }}
    >
      <header className="ui-dialog__header">
        <h2 id={titleId} className="ui-dialog__title">
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
      {children}
      <footer className="ui-dialog__footer">
        <span />
        <Button
          type="button"
          variant="secondary"
          onClick={() => onOpenChange(false)}
        >
          Close
        </Button>
      </footer>
    </dialog>
  )
}
