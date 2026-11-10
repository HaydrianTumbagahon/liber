import type { CSSProperties } from 'react'

type SkeletonProps = {
  variant?: 'text' | 'block' | 'circle'
  width?: CSSProperties['width']
  height?: CSSProperties['height']
  className?: string
}

export function Skeleton({
  variant = 'text',
  width,
  height,
  className = '',
}: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={`ui-skeleton ui-skeleton--${variant} ${className}`.trim()}
      style={{ width, height }}
    />
  )
}
