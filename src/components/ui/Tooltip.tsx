import { Children, cloneElement, useId, useState } from 'react'
import type { ReactElement } from 'react'

type TooltipChildProps = {
  'aria-describedby'?: string
}

type TooltipProps = {
  content: string
  children: ReactElement<TooltipChildProps>
}

export function Tooltip({ content, children }: TooltipProps) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  const child = Children.only(children)
  const describedBy = [children.props['aria-describedby'], id]
    .filter(Boolean)
    .join(' ')

  return (
    <span
      className="ui-tooltip"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocusCapture={() => setVisible(true)}
      onBlurCapture={() => setVisible(false)}
    >
      <span className="ui-tooltip__target">
        {cloneElement(child, { 'aria-describedby': describedBy })}
      </span>
      <span
        id={id}
        role="tooltip"
        className="ui-tooltip__content"
        data-visible={visible}
      >
        {content}
      </span>
    </span>
  )
}
