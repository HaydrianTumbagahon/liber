import { motion, useReducedMotion } from 'framer-motion'
import type { KeyboardEvent } from 'react'

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
  const reduceMotion = useReducedMotion()

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
        <motion.button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          className="ui-segmented__option"
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          whileTap={reduceMotion ? undefined : { scale: 0.97 }}
          transition={{ duration: 0.08 }}
        >
          {option.label}
        </motion.button>
      ))}
    </div>
  )
}
