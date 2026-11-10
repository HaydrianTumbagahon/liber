import { BookOpen, Settings } from 'lucide-react'
import { NavLink } from 'react-router-dom'

const navigationItems = [
  { label: 'Library', to: '/', Icon: BookOpen },
  { label: 'Settings', to: '/settings', Icon: Settings },
] as const

export function AppNavigation() {
  return (
    <nav className="app-navigation" aria-label="Primary navigation">
      {navigationItems.map(({ label, to, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className="app-navigation__link"
        >
          <Icon size={20} strokeWidth={1.6} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
