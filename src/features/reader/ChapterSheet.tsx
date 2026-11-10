import { Button } from '../../components/ui/Button.tsx'
import { Modal } from '../../components/ui/Modal.tsx'

export type ChapterJumpItem = {
  id: string
  title: string
  volumeNumber: number
  segmentIndex: number
}

type ChapterSheetProps = {
  open: boolean
  chapters: readonly ChapterJumpItem[]
  activeChapterId: string | null
  onOpenChange: (open: boolean) => void
  onSelect: (chapter: ChapterJumpItem) => void
}

export function ChapterSheet({
  open,
  chapters,
  activeChapterId,
  onOpenChange,
  onSelect,
}: ChapterSheetProps) {
  return (
    <Modal
      open={open}
      title="Jump to chapter"
      className="reader-chapter-sheet"
      onOpenChange={onOpenChange}
    >
      <ol className="reader-chapter-list" data-lenis-prevent>
        {chapters.map((chapter) => (
          <li key={chapter.id}>
            <Button
              type="button"
              variant="ghost"
              className="reader-chapter-list__item"
              aria-current={
                activeChapterId === chapter.id ? 'location' : undefined
              }
              onClick={() => onSelect(chapter)}
            >
              <span className="reader-chapter-list__volume">
                Vol. {chapter.volumeNumber}
              </span>
              <span>{chapter.title}</span>
            </Button>
          </li>
        ))}
      </ol>
    </Modal>
  )
}
