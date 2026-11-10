import type { ReactNode } from 'react'
import { Button } from './Button.tsx'
import type { ButtonProps } from './Button.tsx'

type IconButtonProps = Omit<ButtonProps, 'children' | 'variant' | 'size'> & {
  label: string
  children: ReactNode
}

export function IconButton({
  label,
  children,
  title,
  ...props
}: IconButtonProps) {
  return (
    <Button aria-label={label} title={title ?? label} variant="icon" {...props}>
      {children}
    </Button>
  )
}
