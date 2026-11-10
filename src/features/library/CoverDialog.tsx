import { useEffect, useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { Button } from '../../components/ui/Button.tsx'
import { Modal } from '../../components/ui/Modal.tsx'

type CoverDialogProps = {
  open: boolean
  selectedCount: number
  onOpenChange: (open: boolean) => void
  onConfirm: (file: File) => Promise<void>
}

export function CoverDialog({
  open,
  selectedCount,
  onOpenChange,
  onConfirm,
}: CoverDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const clearPreview = () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = null
    setPreviewUrl(null)
    setFile(null)
  }

  useEffect(() => {
    if (!open) {
      clearPreview()
      setError('')
    }
  }, [open])

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    },
    [],
  )

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!selected) return

    if (!selected.type.startsWith('image/')) {
      setError('Choose an image file.')
      clearPreview()
      return
    }

    clearPreview()
    const url = URL.createObjectURL(selected)
    previewRef.current = url
    setPreviewUrl(url)
    setFile(selected)
    setError('')
  }

  const handleConfirm = async () => {
    if (!file) return
    setSaving(true)
    setError('')
    try {
      await onConfirm(file)
      onOpenChange(false)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not save cover.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title="Change cover" onOpenChange={onOpenChange}>
      <div className="library-cover-picker">
        <input
          ref={inputRef}
          className="library-import__input"
          hidden
          type="file"
          accept="image/*"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleFileChange}
        />
        {previewUrl ? (
          <img
            className="library-cover-picker__preview"
            src={previewUrl}
            alt="Selected cover preview"
          />
        ) : (
          <div className="library-cover-picker__empty">
            <ImagePlus size={22} aria-hidden="true" />
            <span>No cover selected</span>
          </div>
        )}
        <p className="library-import__note">
          The selected image will be stored on this device for the selected
          books.
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={saving}
          onClick={() => inputRef.current?.click()}
        >
          Choose image
        </Button>
        {error && (
          <p className="library-import__error" role="alert">
            {error}
          </p>
        )}
        <Button
          type="button"
          variant="primary"
          disabled={!file || saving}
          onClick={() => void handleConfirm()}
        >
          {saving
            ? 'Saving cover'
            : `Update cover${selectedCount > 1 ? ` for ${selectedCount} books` : ''}`}
        </Button>
      </div>
    </Modal>
  )
}
