import type { HTMLAttributes, ReactNode } from 'react'

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode
  variant?: 'neutral' | 'accent'
}

export function Badge({
  children,
  variant = 'neutral',
  className = '',
  ...props
}: BadgeProps) {
  return (
    <span
      className={`ui-badge ui-badge--${variant} ${className}`.trim()}
      {...props}
    >
      {children}
    </span>
  )
}
