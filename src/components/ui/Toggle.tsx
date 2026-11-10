import { Button } from './Button.tsx'

type ToggleProps = {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: ToggleProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      role="switch"
      aria-checked={checked}
      className="ui-toggle"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="ui-toggle__track" data-checked={checked}>
        <span className="ui-toggle__thumb" />
      </span>
      <span>{label}</span>
    </Button>
  )
}
