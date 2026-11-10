import { ConfirmDialog } from '../../components/ui/ConfirmDialog.tsx'

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
    <ConfirmDialog
      open={open}
      title={`Delete ${selectedCount === 1 ? 'book' : 'books'}?`}
      description="Deleting the selected books also deletes their reading progress. This cannot be undone."
      confirmLabel={`Delete ${selectedCount} ${selectedCount === 1 ? 'book' : 'books'}`}
      destructive
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
    />
  )
}
