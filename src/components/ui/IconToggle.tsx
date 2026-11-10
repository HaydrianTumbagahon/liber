import { useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { IconButton } from './IconButton.tsx'
import { Tooltip } from './Tooltip.tsx'
import { motionDurations, motionEasings } from '../../lib/motion.ts'

export type IconToggleOption<Value extends string> = {
  value: Value
  label: string
  icon: ReactNode
}

type IconToggleProps<Value extends string> = {
  label: string
  value: Value
  options: readonly IconToggleOption<Value>[]
  onChange: (value: Value) => void
  className?: string
}

export function IconToggle<Value extends string>({
  label,
  value,
  options,
  onChange,
  className = '',
}: IconToggleProps<Value>) {
  const groupId = useId()
  const groupRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const isForward = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    const isBackward = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    if ((!isForward && !isBackward) || options.length === 0) return

    event.preventDefault()
    const direction = isForward ? 1 : -1
    const nextIndex = (index + direction + options.length) % options.length
    const next = options[nextIndex]
    if (!next) return
    onChange(next.value)
    groupRef.current
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      .item(nextIndex)
      ?.focus()
  }

  return (
    <div
      ref={groupRef}
      className={`ui-icon-toggle ${className}`.trim()}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option, index) => {
        const selected = option.value === value

        return (
          <Tooltip content={option.label} key={option.value}>
            <IconButton
              label={option.label}
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              className="ui-icon-toggle__option"
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {selected && (
                <motion.span
                  className="ui-icon-toggle__indicator"
                  layoutId={reduceMotion ? undefined : `${groupId}-indicator`}
                  transition={{
                    duration: reduceMotion ? 0 : motionDurations.base,
                    ease: motionEasings.standard,
                  }}
                  aria-hidden="true"
                />
              )}
              <span className="ui-icon-toggle__icon" aria-hidden="true">
                {option.icon}
              </span>
            </IconButton>
          </Tooltip>
        )
      })}
    </div>
  )
}
