/**
 * Kontoauszug-Page: Alle Transaktionen chronologisch, filterbar.
 */

import { useState, useEffect } from 'react'
import api from '../hooks/api'
import PriceTag from '../components/PriceTag'

const FILTERS = [
  { value: '', label: 'Alle' },
  { value: 'deposit', label: 'Einzahlungen' },
  { value: 'trade_buy', label: 'Käufe' },
  { value: 'trade_sell', label: 'Verkäufe' },
  { value: 'financing', label: 'Finanzierungskosten' },
  { value: 'margin_call', label: 'Margin Calls' },
]

export default function Transactions() {
  const [transactions, setTransactions] = useState([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchTransactions = async () => {
    setLoading(true)
    try {
      const params = filter ? `?type=${filter}` : ''
      const res = await api.get(`/account/transactions${params}`)
      setTransactions(res.data)
    } catch (err) {
      // Ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTransactions()
  }, [filter])

  const typeIcon = (type) => {
    switch (type) {
      case 'deposit': return '+'
      case 'trade_buy': return '\u2193'
      case 'trade_sell': return '\u2191'
      case 'financing': return '%'
      case 'margin_call': return '!'
      case 'fee': return 'F'
      default: return '-'
    }
  }

  const typeBgColor = (type) => {
    switch (type) {
      case 'deposit': return 'bg-accent-green/20 text-accent-green'
      case 'trade_buy': return 'bg-blue-500/20 text-blue-400'
      case 'trade_sell': return 'bg-purple-500/20 text-purple-400'
      case 'financing': return 'bg-yellow-500/20 text-yellow-400'
      case 'margin_call': return 'bg-accent-red/20 text-accent-red'
      default: return 'bg-gray-500/20 text-gray-400'
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-white mb-6">Kontoauszug</h1>

      {/* Filter */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              filter === f.value
                ? 'bg-white/10 text-white'
                : 'text-gray-500 hover:text-white bg-dark-card border border-dark-border'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Transaktionen */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-dark-card rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <div className="bg-dark-card border border-dark-border rounded-2xl p-12 text-center">
          <p className="text-gray-500">Keine Transaktionen gefunden</p>
        </div>
      ) : (
        <div className="bg-dark-card border border-dark-border rounded-2xl divide-y divide-dark-border">
          {transactions.map((tx) => (
            <div key={tx.id} className="flex items-center gap-4 p-4">
              {/* Icon */}
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${typeBgColor(tx.type)}`}>
                {typeIcon(tx.type)}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm truncate">{tx.description}</p>
                <p className="text-xs text-gray-600">
                  {tx.created_at ? new Date(tx.created_at).toLocaleString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }) : ''}
                </p>
              </div>

              {/* Betrag */}
              <PriceTag value={tx.amount} showSign className="font-semibold text-lg" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
