import type { RefObject } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ScrollText,
} from 'lucide-react'
import { Button } from '../../components/ui/Button.tsx'
import { IconToggle } from '../../components/ui/IconToggle.tsx'
import type { ReadingMode } from '../../lib/theme.tsx'

export type ReaderMode = ReadingMode

const modeOptions = [
  {
    label: 'Continuous vertical',
    value: 'continuous',
    icon: <ScrollText size={20} aria-hidden="true" />,
  },
  {
    label: 'Paginated LTR',
    value: 'paginated-ltr',
    icon: (
      <span
        aria-hidden="true"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}
      >
        <BookOpen size={16} />
        <ArrowRight size={14} />
      </span>
    ),
  },
  {
    label: 'Paginated RTL',
    value: 'paginated-rtl',
    icon: (
      <span
        aria-hidden="true"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}
      >
        <BookOpen size={16} />
        <ArrowLeft size={14} />
      </span>
    ),
  },
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
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </Button>
        <div className="reader-topbar__titles">
          <span className="reader-topbar__book">{bookTitle}</span>
          <span className="reader-topbar__volume">{volumeTitle}</span>
        </div>
        <IconToggle<ReaderMode>
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
