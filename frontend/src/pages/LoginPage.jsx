/**
 * Login/Register-Page: Zwei Tabs für Anmelden und Registrieren.
 */

import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, register } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isLogin) {
        await login(username, password)
      } else {
        await register(username, password)
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Ein Fehler ist aufgetreten')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Börsenspiel</h1>
          <p className="text-gray-500 mt-2">Virtuelles Trading – Kein echtes Geld</p>
        </div>

        {/* Card */}
        <div className="bg-dark-card border border-dark-border rounded-2xl p-6">
          {/* Tabs */}
          <div className="flex mb-6 bg-dark-bg rounded-xl p-1">
            <button
              onClick={() => { setIsLogin(true); setError('') }}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                isLogin ? 'bg-dark-card text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Anmelden
            </button>
            <button
              onClick={() => { setIsLogin(false); setError('') }}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                !isLogin ? 'bg-dark-card text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Registrieren
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-accent-red/10 border border-accent-red/20 rounded-xl text-accent-red text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Dein Username"
                className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-accent-green transition-colors"
                required
                minLength={3}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Passwort</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Dein Passwort"
                className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-accent-green transition-colors"
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-accent-green text-black font-semibold hover:brightness-110 transition-all disabled:opacity-50 mt-2"
            >
              {loading
                ? 'Bitte warten...'
                : isLogin
                ? 'Anmelden'
                : 'Registrieren'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
