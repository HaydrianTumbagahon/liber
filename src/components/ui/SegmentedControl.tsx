import type { KeyboardEvent } from 'react'
import { Button } from './Button.tsx'

export type SegmentOption<Value extends string> = {
  label: string
  value: Value
}

type SegmentedControlProps<Value extends string> = {
  label: string
  value: Value
  options: readonly SegmentOption<Value>[]
  onChange: (value: Value) => void
}

export function SegmentedControl<Value extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedControlProps<Value>) {
  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const direction =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0

    if (direction === 0 || options.length === 0) return

    event.preventDefault()
    const nextIndex = (index + direction + options.length) % options.length
    onChange(options[nextIndex].value)
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      .item(nextIndex)
      ?.focus()
  }

  return (
    <div className="ui-segmented" role="radiogroup" aria-label={label}>
      {options.map((option, index) => (
        <Button
          key={option.value}
          type="button"
          variant="ghost"
          role="radio"
          aria-checked={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          className="ui-segmented__option"
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}
