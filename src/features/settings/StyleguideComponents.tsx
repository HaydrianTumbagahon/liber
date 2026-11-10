import { useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Check,
  Info,
  LayoutGrid,
  List,
  LoaderCircle,
  Settings2,
} from 'lucide-react'
import { Badge } from '../../components/ui/Badge.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.tsx'
import { Divider } from '../../components/ui/Divider.tsx'
import { IconButton } from '../../components/ui/IconButton.tsx'
import { IconToggle } from '../../components/ui/IconToggle.tsx'
import { Modal } from '../../components/ui/Modal.tsx'
import { ProgressBar } from '../../components/ui/ProgressBar.tsx'
import { Select } from '../../components/ui/Select.tsx'
import { Skeleton } from '../../components/ui/Skeleton.tsx'
import { Slider } from '../../components/ui/Slider.tsx'
import { Toggle } from '../../components/ui/Toggle.tsx'
import { useStatusBanner } from '../../components/ui/StatusBanner.tsx'
import { useToast } from '../../components/ui/Toast.tsx'

const iconViewOptions = [
  { label: 'Grid view', value: 'grid', icon: <LayoutGrid size={17} /> },
  { label: 'List view', value: 'list', icon: <List size={17} /> },
] as const

const sortOptions = [
  { label: 'Title', value: 'title' },
  { label: 'Author', value: 'author' },
  { label: 'Last read', value: 'last-read' },
] as const

const notificationSamples = [
  { variant: 'success', label: 'Saved', Icon: Check },
  { variant: 'info', label: 'Update ready', Icon: Info },
  { variant: 'warning', label: 'Storage low', Icon: AlertTriangle },
  { variant: 'error', label: 'Import failed', Icon: AlertCircle },
] as const

export function StyleguideComponents({ theme }: { theme: 'light' | 'dark' }) {
  const [toggleOn, setToggleOn] = useState(true)
  const [view, setView] = useState<'list' | 'grid'>('grid')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sort, setSort] =
    useState<(typeof sortOptions)[number]['value']>('title')
  const [speed, setSpeed] = useState(1.2)
  const showToast = useToast()
  const statusBanner = useStatusBanner()

  return (
    <section className="styleguide-panel" data-theme-preview={theme}>
      <h2 className="styleguide-panel__title">
        {theme === 'light' ? 'Light' : 'Dark'} theme
      </h2>

      <div className="styleguide-panel__group">
        <p className="styleguide-panel__label">Buttons</p>
        <Button variant="primary">Open book</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="icon" aria-label="Open book">
          <BookOpen size={18} aria-hidden="true" />
        </Button>
        <Button variant="primary" size="large">
          Large target
        </Button>
      </div>

      <div className="styleguide-panel__group">
        <p className="styleguide-panel__label">Status and progress</p>
        <Badge>12 volumes</Badge>
        <Badge variant="accent">In progress</Badge>
        <div className="styleguide-panel__progress">
          <ProgressBar value={67} label="Reading progress" showValue />
        </div>
      </div>

      <div className="styleguide-panel__group">
        <p className="styleguide-panel__label">Loading state</p>
        <Skeleton variant="circle" width="2.5rem" />
        <Skeleton variant="text" width="9rem" />
        <Skeleton variant="block" width="100%" height="3rem" />
      </div>

      <Divider />

      <div className="styleguide-panel__group">
        <p className="styleguide-panel__label">Controls</p>
        <IconButton label="Library settings">
          <Settings2 size={18} aria-hidden="true" />
        </IconButton>
        <Toggle
          label="Show reading progress"
          checked={toggleOn}
          onChange={setToggleOn}
        />
        <IconToggle
          label="Grid or list layout"
          value={view}
          options={iconViewOptions}
          onChange={setView}
        />
        <Select
          label="Sort books"
          value={sort}
          options={sortOptions}
          onChange={setSort}
        />
        <div className="styleguide-slider">
          <span>Speech speed</span>
          <output>{speed.toFixed(1)}x</output>
          <Slider
            label="Speech speed"
            value={speed}
            min={0.7}
            max={2}
            step={0.1}
            valueText={`${speed.toFixed(1)}x`}
            onChange={setSpeed}
          />
        </div>
      </div>

      <div className="styleguide-panel__group">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setDialogOpen(true)}
        >
          Open dialog
        </Button>
        <Modal
          open={dialogOpen}
          title="Reading settings"
          onOpenChange={setDialogOpen}
          themePreview={theme}
        >
          <p className="reading-text">
            Choose a comfortable pace and return to your book.
          </p>
        </Modal>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setConfirmOpen(true)}
        >
          Open confirmation
        </Button>
        <ConfirmDialog
          open={confirmOpen}
          title="Delete sample book?"
          description="This confirmation uses the destructive action style."
          confirmLabel="Delete book"
          destructive
          themePreview={theme}
          onOpenChange={setConfirmOpen}
          onConfirm={() => undefined}
        />
      </div>

      <div className="styleguide-panel__group styleguide-feedback-preview">
        <p className="styleguide-panel__label">Notifications and resync</p>
        {notificationSamples.map(({ variant, label, Icon }) => (
          <Button
            key={variant}
            type="button"
            variant="secondary"
            onClick={() =>
              showToast({
                message: `${label}.`,
                variant,
                ...(variant === 'success'
                  ? { action: { label: 'Undo', onClick: () => undefined } }
                  : {}),
              })
            }
          >
            <Icon size={15} aria-hidden="true" />
            {label}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            statusBanner.working('Scanning library')
            window.setTimeout(() => statusBanner.done('Scan complete'), 700)
          }}
        >
          Preview resync banner
        </Button>
        <div className="styleguide-status-samples" aria-hidden="true">
          <div className="ui-status-banner styleguide-status-sample">
            <LoaderCircle size={16} />
            Scanning library
          </div>
          <div className="ui-status-banner styleguide-status-sample">
            <Check size={16} />
            Scan complete
          </div>
        </div>
      </div>

      <div className="styleguide-panel__group styleguide-toast-preview">
        <p className="styleguide-panel__label">Toast appearance</p>
        {notificationSamples.map(({ variant, label, Icon }) => (
          <div
            className={`ui-toast ui-toast--${variant}`}
            role="status"
            key={variant}
          >
            <Icon size={17} aria-hidden="true" />
            <span className="ui-toast__message">{label}</span>
            <span className="ui-toast__progress" aria-hidden="true" />
          </div>
        ))}
      </div>

      <Divider />

      <div className="styleguide-panel__group">
        <BookOpen size={18} aria-hidden="true" />
        <span className="reading-text">
          A quiet page, ready for the next chapter.
        </span>
      </div>
    </section>
  )
}
