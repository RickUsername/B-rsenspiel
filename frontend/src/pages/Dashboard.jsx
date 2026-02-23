/**
 * Dashboard: Übersicht mit Gesamtportfoliowert, Kontostand, Watchlist und letzten Transaktionen.
 */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useWebSocket } from '../hooks/useWebSocket'
import api from '../hooks/api'
import PriceTag from '../components/PriceTag'
import DepositModal from '../components/DepositModal'

export default function Dashboard() {
  const { user } = useAuth()
  const { data: wsData } = useWebSocket(user?.accountId)
  const [balance, setBalance] = useState(null)
  const [watchlist, setWatchlist] = useState([])
  const [transactions, setTransactions] = useState([])
  const [showDeposit, setShowDeposit] = useState(false)

  const fetchData = async () => {
    try {
      const [balRes, watchRes, txRes] = await Promise.all([
        api.get('/account/balance'),
        api.get('/account/watchlist'),
        api.get('/account/transactions'),
      ])
      setBalance(balRes.data)
      setWatchlist(watchRes.data)
      setTransactions(txRes.data.slice(0, 5))
    } catch (err) {
      // Stille Fehlerbehandlung
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Live-Daten vom WebSocket übernehmen
  const totalValue = wsData?.total_value ?? balance?.total_value ?? 0
  const portfolioValue = wsData?.portfolio_value ?? balance?.portfolio_value ?? 0
  const cashBalance = wsData?.balance ?? balance?.balance ?? 0

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Gesamtportfoliowert */}
      <div className="mb-8">
        <p className="text-sm text-gray-500 mb-1">Gesamtportfoliowert</p>
        <h1 className="text-4xl font-bold text-white">
          {totalValue.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
        </h1>
      </div>

      {/* Konto & Einzahlen */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-dark-card border border-dark-border rounded-2xl p-5">
          <p className="text-sm text-gray-500 mb-1">Verfügbares Guthaben</p>
          <p className="text-2xl font-semibold text-white">
            {cashBalance.toLocaleString('de-DE', { minimumFractionDigits: 2 })}€
          </p>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-2xl p-5">
          <p className="text-sm text-gray-500 mb-1">Investiert</p>
          <p className="text-2xl font-semibold text-white">
            {portfolioValue.toLocaleString('de-DE', { minimumFractionDigits: 2 })}€
          </p>
        </div>
      </div>

      {/* Einzahlen Button */}
      <button
        onClick={() => setShowDeposit(true)}
        className="w-full py-3 mb-8 rounded-xl bg-dark-card border border-dark-border text-white font-medium hover:bg-dark-hover transition-colors"
      >
        + Geld einzahlen
      </button>

      {/* Watchlist */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-white">Watchlist</h2>
          <Link to="/market" className="text-sm text-gray-500 hover:text-white transition-colors">
            Bearbeiten
          </Link>
        </div>

        {watchlist.length === 0 ? (
          <div className="bg-dark-card border border-dark-border rounded-2xl p-6 text-center">
            <p className="text-gray-500">Noch keine Assets in der Watchlist</p>
            <Link to="/market" className="text-accent-green text-sm hover:underline mt-2 inline-block">
              Jetzt Assets hinzufügen
            </Link>
          </div>
        ) : (
          <div className="bg-dark-card border border-dark-border rounded-2xl divide-y divide-dark-border">
            {watchlist.slice(0, 5).map((item) => (
              <Link
                key={item.ticker}
                to={`/asset/${item.ticker}`}
                className="flex items-center justify-between p-4 hover:bg-dark-hover transition-colors first:rounded-t-2xl last:rounded-b-2xl"
              >
                <div>
                  <p className="text-white font-medium">{item.ticker}</p>
                  <p className="text-xs text-gray-500">{item.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-white">
                    {item.price?.toLocaleString('de-DE', { minimumFractionDigits: 2 })} {item.currency}
                  </p>
                  <PriceTag
                    value={item.change_percent}
                    suffix="%"
                    showSign
                    className="text-xs"
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Letzte Transaktionen */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-white">Letzte Aktivitäten</h2>
          <Link to="/transactions" className="text-sm text-gray-500 hover:text-white transition-colors">
            Alle anzeigen
          </Link>
        </div>

        {transactions.length === 0 ? (
          <div className="bg-dark-card border border-dark-border rounded-2xl p-6 text-center">
            <p className="text-gray-500">Noch keine Transaktionen</p>
          </div>
        ) : (
          <div className="bg-dark-card border border-dark-border rounded-2xl divide-y divide-dark-border">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-white text-sm">{tx.description}</p>
                  <p className="text-xs text-gray-500">
                    {tx.created_at ? new Date(tx.created_at).toLocaleString('de-DE') : ''}
                  </p>
                </div>
                <PriceTag value={tx.amount} showSign className="font-medium" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deposit Modal */}
      <DepositModal
        isOpen={showDeposit}
        onClose={() => setShowDeposit(false)}
        onSuccess={fetchData}
      />
    </div>
  )
}
