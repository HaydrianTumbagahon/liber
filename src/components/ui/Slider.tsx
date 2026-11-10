import { useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'

type SliderProps = {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  disabled?: boolean
  valueText?: string
  className?: string
}

function snapValue(value: number, min: number, max: number, step: number) {
  const snapped = Math.min(
    max,
    Math.max(min, min + Math.round((value - min) / step) * step),
  )
  return Number(snapped.toFixed(5))
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled = false,
  valueText,
  className = '',
}: SliderProps) {
  const sliderRef = useRef<HTMLDivElement>(null)
  const pointerId = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const ratio =
    max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0

  const updateFromPointer = (clientX: number) => {
    const rect = sliderRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    onChange(
      snapValue(
        min + ((clientX - rect.left) / rect.width) * (max - min),
        min,
        max,
        step,
      ),
    )
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    pointerId.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.focus()
    setDragging(true)
    updateFromPointer(event.clientX)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging && pointerId.current === event.pointerId) {
      updateFromPointer(event.clientX)
    }
  }

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== event.pointerId) return
    pointerId.current = null
    setDragging(false)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const increment =
      event.key === 'PageUp' || event.key === 'PageDown' ? step * 10 : step
    let next: number | null = null
    if (
      event.key === 'ArrowRight' ||
      event.key === 'ArrowUp' ||
      event.key === 'PageUp'
    )
      next = value + increment
    else if (
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowDown' ||
      event.key === 'PageDown'
    )
      next = value - increment
    else if (event.key === 'Home') next = min
    else if (event.key === 'End') next = max
    if (next === null) return
    event.preventDefault()
    onChange(snapValue(next, min, max, step))
  }

  return (
    <div
      ref={sliderRef}
      className={`ui-slider${dragging ? ' is-dragging' : ''}${disabled ? ' is-disabled' : ''} ${className}`.trim()}
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText ?? String(value)}
      aria-disabled={disabled || undefined}
      aria-orientation="horizontal"
      tabIndex={disabled ? -1 : 0}
      style={{ '--slider-value': `${ratio * 100}%` } as React.CSSProperties}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <span className="ui-slider__track" aria-hidden="true">
        <span className="ui-slider__fill" />
        <span className="ui-slider__thumb" />
      </span>
    </div>
  )
}
