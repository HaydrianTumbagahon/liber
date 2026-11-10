import { useState } from 'react'
import { BookOpen, Settings2 } from 'lucide-react'
import { Badge } from '../../components/ui/Badge.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { Dialog } from '../../components/ui/Dialog.tsx'
import { Divider } from '../../components/ui/Divider.tsx'
import { IconButton } from '../../components/ui/IconButton.tsx'
import { ProgressBar } from '../../components/ui/ProgressBar.tsx'
import { SegmentedControl } from '../../components/ui/SegmentedControl.tsx'
import { Skeleton } from '../../components/ui/Skeleton.tsx'
import { Toggle } from '../../components/ui/Toggle.tsx'
import { useTheme } from '../../lib/theme.tsx'
import type { ThemeMode } from '../../lib/theme.tsx'

const themeOptions = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'System', value: 'system' },
] as const

const viewOptions = [
  { label: 'List', value: 'list' },
  { label: 'Grid', value: 'grid' },
] as const

function PrimitivePreview({ theme }: { theme: 'light' | 'dark' }) {
  const [toggleOn, setToggleOn] = useState(true)
  const [view, setView] = useState<'list' | 'grid'>('grid')
  const [dialogOpen, setDialogOpen] = useState(false)

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
        <SegmentedControl
          label="Library view"
          value={view}
          options={viewOptions}
          onChange={setView}
        />
      </div>

      <div className="styleguide-panel__group">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setDialogOpen(true)}
        >
          Open dialog
        </Button>
        <Dialog
          open={dialogOpen}
          title="Reading settings"
          onOpenChange={setDialogOpen}
        >
          <p className="reading-text">
            Choose a comfortable pace and return to your book.
          </p>
        </Dialog>
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

export function Styleguide() {
  const { theme, setTheme } = useTheme()

  return (
    <main className="styleguide">
      <header className="styleguide__header">
        <h1 className="styleguide__title">Styleguide</h1>
        <div className="styleguide__theme-control">
          <span className="styleguide__theme-label">Appearance</span>
          <SegmentedControl<ThemeMode>
            label="Appearance"
            value={theme}
            options={themeOptions}
            onChange={setTheme}
          />
        </div>
      </header>
      <div className="styleguide__panels">
        <PrimitivePreview theme="light" />
        <PrimitivePreview theme="dark" />
      </div>
    </main>
  )
}
