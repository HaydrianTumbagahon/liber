import { useState } from 'react'
import { Button } from './Button.tsx'
import { Modal } from './Modal.tsx'

type ConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void | Promise<void>
  destructive?: boolean
  cancelLabel?: string
  themePreview?: 'light' | 'dark'
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onOpenChange,
  onConfirm,
  destructive = false,
  cancelLabel = 'Cancel',
  themePreview,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const confirm = async () => {
    setBusy(true)
    setError('')
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The action could not be completed.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      onOpenChange={onOpenChange}
      themePreview={themePreview}
    >
      <div className="ui-confirm">
        <p className="ui-confirm__description">{description}</p>
        {error && (
          <p className="ui-confirm__error" role="alert">
            {error}
          </p>
        )}
        <div className="ui-confirm__actions">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="primary"
            className={destructive ? 'ui-button--destructive' : ''}
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? 'Working' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
