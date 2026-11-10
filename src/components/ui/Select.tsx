import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from './Button.tsx'
import { resolveMotionPreset } from '../../lib/motion.ts'

export type SelectOption<Value extends string> = {
  value: Value
  label: string
  disabled?: boolean
}

type SelectProps<Value extends string> = {
  label: string
  value: Value
  options: readonly SelectOption<Value>[]
  onChange: (value: Value) => void
  className?: string
  disabled?: boolean
}

function getEnabledIndex(
  options: readonly SelectOption<string>[],
  startIndex: number,
  direction: 1 | -1,
) {
  for (let offset = 0; offset < options.length; offset += 1) {
    const index =
      (startIndex + direction * offset + options.length * 2) % options.length
    if (!options[index]?.disabled) return index
  }
  return -1
}

export function Select<Value extends string>({
  label,
  value,
  options,
  onChange,
  className = '',
  disabled = false,
}: SelectProps<Value>) {
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const typeahead = useRef('')
  const typeaheadTimer = useRef<number | null>(null)
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      options.findIndex((option) => option.value === value),
    ),
  )
  const [placement, setPlacement] = useState<'above' | 'below'>('below')
  const [maxHeight, setMaxHeight] = useState(280)
  const selected = options.find((option) => option.value === value)
  const animation = resolveMotionPreset('popIn', Boolean(reduceMotion))

  const close = (restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus)
      window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const openAt = (index: number) => {
    const next = index < 0 ? getEnabledIndex(options, 0, 1) : index
    if (next < 0) return
    setActiveIndex(next)
    setOpen(true)
  }

  useLayoutEffect(() => {
    if (!open) return
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close()
    }
    const positionPopover = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const below = window.innerHeight - rect.bottom - 12
      const above = rect.top - 12
      const flip = below < Math.min(280, options.length * 44) && above > below
      setPlacement(flip ? 'above' : 'below')
      setMaxHeight(Math.max(120, Math.min(280, flip ? above : below)))
    }

    positionPopover()
    document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('resize', positionPopover)
    window.addEventListener('scroll', positionPopover, true)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('resize', positionPopover)
      window.removeEventListener('scroll', positionPopover, true)
    }
  }, [open, options.length])

  useEffect(
    () => () => {
      if (typeaheadTimer.current !== null) {
        window.clearTimeout(typeaheadTimer.current)
      }
    },
    [],
  )

  const choose = (index: number) => {
    const option = options[index]
    if (!option || option.disabled) return
    onChange(option.value)
    close(true)
  }

  const moveActive = (direction: 1 | -1) => {
    const next = getEnabledIndex(options, activeIndex + direction, direction)
    if (next < 0) return
    setActiveIndex(next)
    optionRefs.current[next]?.focus()
  }

  const findTypeaheadMatch = (character: string) => {
    typeahead.current += character.toLocaleLowerCase()
    if (typeaheadTimer.current !== null) {
      window.clearTimeout(typeaheadTimer.current)
    }
    typeaheadTimer.current = window.setTimeout(() => {
      typeahead.current = ''
    }, 650)

    const start = Math.max(0, activeIndex)
    for (let offset = 0; offset < options.length; offset += 1) {
      const index = (start + offset) % options.length
      const option = options[index]
      if (
        option &&
        !option.disabled &&
        option.label.toLocaleLowerCase().startsWith(typeahead.current)
      ) {
        setActiveIndex(index)
        if (open) optionRefs.current[index]?.focus()
        else openAt(index)
        return
      }
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (disabled) return
    if (!open) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        const start = activeIndex < 0 ? 0 : activeIndex + 1
        openAt(getEnabledIndex(options, start, 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        const start = activeIndex < 0 ? options.length - 1 : activeIndex - 1
        openAt(getEnabledIndex(options, start, -1))
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        openAt(
          Math.max(
            0,
            options.findIndex((option) => option.value === value),
          ),
        )
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        findTypeaheadMatch(event.key)
      }
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault()
      moveActive(1)
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault()
      moveActive(-1)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const index = event.key === 'Home' ? 0 : options.length - 1
      const next = getEnabledIndex(
        options,
        index,
        event.key === 'Home' ? 1 : -1,
      )
      if (next >= 0) {
        setActiveIndex(next)
        optionRefs.current[next]?.focus()
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      choose(activeIndex)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close(true)
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      findTypeaheadMatch(event.key)
    }
  }

  return (
    <div
      ref={rootRef}
      className={`ui-select ${className}`.trim()}
      onKeyDown={handleKeyDown}
    >
      <Button
        ref={triggerRef}
        type="button"
        variant="secondary"
        className="ui-select__trigger"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        disabled={disabled || options.length === 0}
        onClick={() => {
          if (open) close()
          else
            openAt(
              Math.max(
                0,
                options.findIndex((option) => option.value === value),
              ),
            )
        }}
      >
        <span className="ui-select__value">{selected?.label ?? label}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={`${id}-listbox`}
            className={`ui-select__popover ui-select__popover--${placement}`}
            role="listbox"
            aria-label={label}
            data-lenis-prevent
            style={{ maxHeight }}
            variants={animation.variants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={animation.transition}
          >
            {options.map((option, index) => (
              <Button
                ref={(element) => {
                  optionRefs.current[index] = element
                }}
                id={`${id}-option-${index}`}
                key={option.value}
                type="button"
                variant="ghost"
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                tabIndex={activeIndex === index ? 0 : -1}
                className="ui-select__option"
                disabled={option.disabled}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => choose(index)}
              >
                <span>{option.label}</span>
                {option.value === value && (
                  <Check size={16} aria-hidden="true" />
                )}
              </Button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
