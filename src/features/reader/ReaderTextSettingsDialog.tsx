import { Dialog } from '../../components/ui/Dialog.tsx'
import { useSettings } from '../../lib/theme.tsx'

type ReaderTextSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReaderTextSettingsDialog({
  open,
  onOpenChange,
}: ReaderTextSettingsDialogProps) {
  const { settings, updateSettings } = useSettings()

  return (
    <Dialog
      open={open}
      title="Reading appearance"
      className="reader-text-settings"
      onOpenChange={onOpenChange}
    >
      <div className="reader-text-settings__controls">
        <label className="reader-text-settings__control">
          <span>Font size</span>
          <output>{Number(settings.readerFontSize.toFixed(3))} rem</output>
          <input
            type="range"
            min="0.875"
            max="1.5"
            step="0.0625"
            value={settings.readerFontSize}
            onChange={(event) =>
              void updateSettings({
                readerFontSize: Number(event.target.value),
              })
            }
          />
        </label>
        <label className="reader-text-settings__control">
          <span>Line height</span>
          <output>{settings.readerLineHeight.toFixed(1)}</output>
          <input
            type="range"
            min="1.4"
            max="2.2"
            step="0.1"
            value={settings.readerLineHeight}
            onChange={(event) =>
              void updateSettings({
                readerLineHeight: Number(event.target.value),
              })
            }
          />
        </label>
        <label className="reader-text-settings__control">
          <span>Page margins</span>
          <output>{Number(settings.readerMargins.toFixed(2))} rem</output>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.25"
            value={settings.readerMargins}
            onChange={(event) =>
              void updateSettings({ readerMargins: Number(event.target.value) })
            }
          />
        </label>
      </div>
    </Dialog>
  )
}
