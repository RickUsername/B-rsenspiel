/**
 * App-Hauptkomponente: Routing und Layout.
 */

import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import Portfolio from './pages/Portfolio'
import MarketSearch from './pages/MarketSearch'
import AssetDetail from './pages/AssetDetail'
import Transactions from './pages/Transactions'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-gray-400">Laden...</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-gray-400">Laden...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-dark-bg">
      {user && <Navbar />}
      <main className={user ? 'safe-area-offset-top' : ''}>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/portfolio" element={<ProtectedRoute><Portfolio /></ProtectedRoute>} />
          <Route path="/market" element={<ProtectedRoute><MarketSearch /></ProtectedRoute>} />
          <Route path="/asset/:ticker" element={<ProtectedRoute><AssetDetail /></ProtectedRoute>} />
          <Route path="/transactions" element={<ProtectedRoute><Transactions /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
