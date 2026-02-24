/**
 * Axios-Instanz mit Basis-Konfiguration für API-Calls.
 */

import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Token aus localStorage setzen falls vorhanden
const token = localStorage.getItem('token')
if (token) {
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`
}

// Response-Interceptor für Fehlerbehandlung
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token abgelaufen → Logout
      localStorage.removeItem('token')
      localStorage.removeItem('username')
      localStorage.removeItem('accountId')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
