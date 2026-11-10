import { Button } from '../../components/ui/Button.tsx'
import { Dialog } from '../../components/ui/Dialog.tsx'

type DeleteBooksDialogProps = {
  open: boolean
  selectedCount: number
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function DeleteBooksDialog({
  open,
  selectedCount,
  onOpenChange,
  onConfirm,
}: DeleteBooksDialogProps) {
  return (
    <Dialog
      open={open}
      title={`Delete ${selectedCount === 1 ? 'book' : 'books'}?`}
      onOpenChange={onOpenChange}
    >
      <p className="reading-text">
        Deleting the selected books also deletes their reading progress. This
        cannot be undone.
      </p>
      <Button
        type="button"
        variant="primary"
        className="library-delete-confirm"
        onClick={onConfirm}
      >
        Delete {selectedCount} {selectedCount === 1 ? 'book' : 'books'}
      </Button>
    </Dialog>
  )
}
