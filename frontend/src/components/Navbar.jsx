/**
 * Navbar: Hauptnavigation mit Logo, Links und Username.
 * Mobile: Hamburger-Menü öffnet Sidebar von links.
 * Desktop: Top-Navbar wie bisher.
 */

import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const navLinks = [
  {
    path: '/',
    label: 'Dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
      </svg>
    ),
  },
  {
    path: '/portfolio',
    label: 'Portfolio',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4v16" />
      </svg>
    ),
  },
  {
    path: '/market',
    label: 'Markt',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    path: '/transactions',
    label: 'Kontoauszug',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
  },
]

export default function Navbar() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Sidebar schließen bei Navigation
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  // Body-Scroll sperren wenn Sidebar offen
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  return (
    <>
      {/* Top-Nav */}
      <nav className="fixed top-0 left-0 right-0 h-16 bg-dark-card border-b border-dark-border z-50 flex items-center px-4 md:px-6">
        {/* Hamburger — nur Mobile */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="md:hidden w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white transition-colors -ml-2 mr-2"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Logo */}
        <Link to="/" className="text-xl font-bold text-white mr-8">
          Börsenspiel
        </Link>

        {/* Desktop Navigation Links */}
        <div className="hidden md:flex gap-1">
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
            className="hidden md:block text-sm text-gray-500 hover:text-white transition-colors"
          >
            Abmelden
          </button>
        </div>
      </nav>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-[60]">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />

          {/* Sidebar */}
          <div className="absolute top-0 left-0 bottom-0 w-72 bg-dark-card border-r border-dark-border flex flex-col">
            {/* Sidebar Header */}
            <div className="h-16 flex items-center justify-between px-4 border-b border-dark-border">
              <span className="text-lg font-bold text-white">Börsenspiel</span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Nav Links */}
            <div className="flex-1 py-4 px-3 space-y-1">
              {navLinks.map((link) => {
                const isActive = location.pathname === link.path
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-white/10 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {link.icon}
                    {link.label}
                  </Link>
                )
              })}
            </div>

            {/* Sidebar Footer — User & Logout */}
            <div className="border-t border-dark-border p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white text-sm font-semibold">
                  {user?.username?.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-white font-medium">{user?.username}</span>
              </div>
              <button
                onClick={logout}
                className="w-full py-2.5 rounded-xl text-sm text-gray-400 hover:text-white bg-dark-bg border border-dark-border hover:border-gray-500 transition-colors"
              >
                Abmelden
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
