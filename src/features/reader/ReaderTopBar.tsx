import type { RefObject } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '../../components/ui/Button.tsx'
import { SegmentedControl } from '../../components/ui/SegmentedControl.tsx'
import type { ReadingMode } from '../../lib/theme.tsx'

export type ReaderMode = ReadingMode

const modeOptions = [
  { label: 'Scroll', value: 'continuous' },
  { label: 'LTR', value: 'paginated-ltr' },
  { label: 'RTL', value: 'paginated-rtl' },
] as const

type ReaderTopBarProps = {
  bookTitle: string
  volumeTitle: string
  visible: boolean
  mode: ReaderMode
  onModeChange: (mode: ReaderMode) => void
  onBack: () => void
  progressRef: RefObject<HTMLProgressElement | null>
}

export function ReaderTopBar({
  bookTitle,
  volumeTitle,
  visible,
  mode,
  onModeChange,
  onBack,
  progressRef,
}: ReaderTopBarProps) {
  return (
    <header className="reader-topbar" data-visible={visible} inert={!visible}>
      <div className="reader-topbar__row">
        <Button
          type="button"
          variant="ghost"
          className="reader-topbar__back"
          onClick={onBack}
          aria-label="Back to book details"
          title="Back to book details"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </Button>
        <div className="reader-topbar__titles">
          <span className="reader-topbar__book">{bookTitle}</span>
          <span className="reader-topbar__volume">{volumeTitle}</span>
        </div>
        <SegmentedControl<ReaderMode>
          label="Reading mode"
          value={mode}
          options={modeOptions}
          onChange={onModeChange}
        />
      </div>
      <progress
        ref={progressRef}
        className="reader-topbar__progress"
        max={100}
        value={0}
        aria-label="Reading progress"
      />
    </header>
  )
}
