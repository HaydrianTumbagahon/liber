import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button.tsx'
import { Modal } from '../../components/ui/Modal.tsx'

type GroupBooksDialogProps = {
  open: boolean
  selectedCount: number
  initialTitle: string
  onOpenChange: (open: boolean) => void
  onConfirm: (seriesTitle: string) => Promise<void>
}

export function GroupBooksDialog({
  open,
  selectedCount,
  initialTitle,
  onOpenChange,
  onConfirm,
}: GroupBooksDialogProps) {
  const [seriesTitle, setSeriesTitle] = useState(initialTitle)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setSeriesTitle(initialTitle)
    setError('')
  }, [initialTitle, open])

  const handleConfirm = async () => {
    const title = seriesTitle.trim()
    if (!title) {
      setError('Enter a series title.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await onConfirm(title)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not group books.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title="Group as series" onOpenChange={onOpenChange}>
      <div className="library-group-series">
        <p className="library-import__note">
          Combine {selectedCount} selected books and their volumes under one
          series.
        </p>
        <label className="library-group-series__field">
          <span>Series title</span>
          <input
            autoFocus
            value={seriesTitle}
            onChange={(event) => setSeriesTitle(event.target.value)}
            maxLength={240}
            disabled={saving}
          />
        </label>
        {error && (
          <p className="library-import__error" role="alert">
            {error}
          </p>
        )}
        <Button
          type="button"
          variant="primary"
          disabled={saving || !seriesTitle.trim()}
          onClick={() => void handleConfirm()}
        >
          {saving ? 'Grouping' : 'Group books'}
        </Button>
      </div>
    </Modal>
  )
}
