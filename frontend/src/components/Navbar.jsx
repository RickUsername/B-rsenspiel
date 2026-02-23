/**
 * Navbar: Hauptnavigation mit Logo, Links und Username.
 */

import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const navLinks = [
  { path: '/', label: 'Dashboard' },
  { path: '/portfolio', label: 'Portfolio' },
  { path: '/market', label: 'Markt' },
  { path: '/transactions', label: 'Kontoauszug' },
]

export default function Navbar() {
  const { user, logout } = useAuth()
  const location = useLocation()

  return (
    <nav className="fixed top-0 left-0 right-0 h-16 bg-dark-card border-b border-dark-border z-50 flex items-center px-6">
      {/* Logo */}
      <Link to="/" className="text-xl font-bold text-white mr-8">
        Börsenspiel
      </Link>

      {/* Navigation Links */}
      <div className="flex gap-1">
        {navLinks.map((link) => (
          <Link
            key={link.path}
            to={link.path}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              location.pathname === link.path
                ? 'bg-white/10 text-white'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* User */}
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-400">{user?.username}</span>
        <button
          onClick={logout}
          className="text-sm text-gray-500 hover:text-white transition-colors"
        >
          Abmelden
        </button>
      </div>
    </nav>
  )
}
