import { Modal } from '../../components/ui/Modal.tsx'
import { Slider } from '../../components/ui/Slider.tsx'
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
    <Modal
      open={open}
      title="Reading appearance"
      className="reader-text-settings"
      onOpenChange={onOpenChange}
    >
      <div className="reader-text-settings__controls">
        <div className="reader-text-settings__control">
          <span>Font size</span>
          <output>{Number(settings.readerFontSize.toFixed(3))} rem</output>
          <Slider
            label="Font size"
            value={settings.readerFontSize}
            min={0.875}
            max={1.5}
            step={0.0625}
            valueText={`${Number(settings.readerFontSize.toFixed(3))} rem`}
            onChange={(readerFontSize) =>
              void updateSettings({
                readerFontSize,
              })
            }
          />
        </div>
        <div className="reader-text-settings__control">
          <span>Line height</span>
          <output>{settings.readerLineHeight.toFixed(1)}</output>
          <Slider
            label="Line height"
            value={settings.readerLineHeight}
            min={1.4}
            max={2.2}
            step={0.1}
            valueText={settings.readerLineHeight.toFixed(1)}
            onChange={(readerLineHeight) =>
              void updateSettings({
                readerLineHeight,
              })
            }
          />
        </div>
        <div className="reader-text-settings__control">
          <span>Page margins</span>
          <output>{Number(settings.readerMargins.toFixed(2))} rem</output>
          <Slider
            label="Page margins"
            value={settings.readerMargins}
            min={0.5}
            max={3}
            step={0.25}
            valueText={`${Number(settings.readerMargins.toFixed(2))} rem`}
            onChange={(readerMargins) => void updateSettings({ readerMargins })}
          />
        </div>
      </div>
    </Modal>
  )
}
