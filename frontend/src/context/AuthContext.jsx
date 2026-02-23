/**
 * AuthContext: Globaler Zustand für Authentifizierung.
 * Verwaltet JWT-Token, User-Daten und Login/Logout/Register-Funktionen.
 */

import { createContext, useContext, useState, useEffect } from 'react'
import api from '../hooks/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [accountId, setAccountId] = useState(localStorage.getItem('accountId'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      // Prüfe ob Token noch gültig ist
      api.get('/account/balance')
        .then(() => {
          setUser({
            username: localStorage.getItem('username'),
            accountId: parseInt(localStorage.getItem('accountId')),
          })
        })
        .catch(() => {
          logout()
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (username, password) => {
    const res = await api.post('/auth/login', { username, password })
    const { access_token, username: name, account_id } = res.data
    localStorage.setItem('token', access_token)
    localStorage.setItem('username', name)
    localStorage.setItem('accountId', account_id)
    api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`
    setToken(access_token)
    setAccountId(account_id)
    setUser({ username: name, accountId: account_id })
    return res.data
  }

  const register = async (username, password) => {
    const res = await api.post('/auth/register', { username, password })
    const { access_token, username: name, account_id } = res.data
    localStorage.setItem('token', access_token)
    localStorage.setItem('username', name)
    localStorage.setItem('accountId', account_id)
    api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`
    setToken(access_token)
    setAccountId(account_id)
    setUser({ username: name, accountId: account_id })
    return res.data
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    localStorage.removeItem('accountId')
    delete api.defaults.headers.common['Authorization']
    setToken(null)
    setAccountId(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, accountId, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden')
  }
  return context
}
