/**
 * Kontoauszug-Page: Alle Transaktionen chronologisch, filterbar.
 * Jede Zeile ist aufklappbar und zeigt typspezifische Details.
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

function DetailRow({ label, children }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className="text-white text-sm">{children}</span>
    </div>
  )
}

function fmt(value) {
  return Math.abs(value).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function TradeDetails({ tx }) {
  const td = tx.trade_details

  if (tx.type === 'trade_buy') {
    if (!td) return <p className="text-gray-600 text-sm">Keine Details verfügbar</p>
    // quantity enthält den Hebel bereits (quantity = margin * leverage / price)
    const positionSize = td.price * td.quantity
    const marginUsed = positionSize / (td.leverage || 1)
    const liquidationPrice = td.leverage > 1 ? td.price * (1 - 0.9 / td.leverage) : null
    return (
      <>
        <DetailRow label="Asset">{td.name} ({td.ticker})</DetailRow>
        <DetailRow label="Menge">{td.quantity?.toFixed(4)} Stk.</DetailRow>
        <DetailRow label="Kurs">${td.price?.toFixed(2)}</DetailRow>
        {td.leverage > 1 && <DetailRow label="Hebel"><span className="text-yellow-400">{td.leverage}x</span></DetailRow>}
        {td.leverage > 1 && <DetailRow label="Margin-Einsatz">{fmt(marginUsed)}€</DetailRow>}
        <DetailRow label="Positionsgröße">{fmt(positionSize)}€</DetailRow>
        <DetailRow label="Gebühr">{fmt(td.fee || 0)}€</DetailRow>
        {liquidationPrice && (
          <DetailRow label="Liquidationskurs">
            <span className="text-accent-red">${liquidationPrice.toFixed(2)}</span>
          </DetailRow>
        )}
      </>
    )
  }

  if (tx.type === 'trade_sell') {
    if (!td) return <p className="text-gray-600 text-sm">Keine Details verfügbar</p>
    const payout = Math.abs(tx.amount)
    return (
      <>
        <DetailRow label="Asset">{td.name} ({td.ticker})</DetailRow>
        <DetailRow label="Menge verkauft">{td.quantity?.toFixed(4)} Stk.</DetailRow>
        <DetailRow label="Verkaufskurs">${td.price?.toFixed(2)}</DetailRow>
        {td.leverage > 1 && <DetailRow label="Hebel"><span className="text-yellow-400">{td.leverage}x</span></DetailRow>}
        <DetailRow label="Gebühr">{fmt(td.fee || 0)}€</DetailRow>
        <DetailRow label="Realisierter P&L">
          <PriceTag value={td.realized_pnl || 0} showSign className="font-semibold" />
        </DetailRow>
        <DetailRow label="Auszahlung">{fmt(payout)}€</DetailRow>
      </>
    )
  }

  if (tx.type === 'margin_call') {
    if (!td) return <p className="text-gray-600 text-sm">Keine Details verfügbar</p>
    return (
      <>
        <DetailRow label="Asset">{td.name} ({td.ticker})</DetailRow>
        <DetailRow label="Liquidationskurs">${td.price?.toFixed(2)}</DetailRow>
        <DetailRow label="Menge liquidiert">{td.quantity?.toFixed(4)} Stk.</DetailRow>
        {td.leverage > 1 && <DetailRow label="Hebel"><span className="text-yellow-400">{td.leverage}x</span></DetailRow>}
        <DetailRow label="Gebühr">{fmt(td.fee || 0)}€</DetailRow>
        <DetailRow label="Realisierter P&L">
          <PriceTag value={td.realized_pnl || 0} showSign className="font-semibold" />
        </DetailRow>
      </>
    )
  }

  if (tx.type === 'financing') {
    // Ticker aus Beschreibung extrahieren (z.B. "Finanzierungskosten AAPL")
    const match = tx.description?.match(/(?:Finanzierungskosten|Financing)\s+(\S+)/i)
    const ticker = match ? match[1] : null
    return (
      <>
        {ticker && <DetailRow label="Position">{ticker}</DetailRow>}
        <DetailRow label="Tägliche Belastung">{fmt(Math.abs(tx.amount))}€</DetailRow>
      </>
    )
  }

  if (tx.type === 'deposit') {
    const senderMatch = tx.description?.match(/von\s+(.+?)(?:\s+am\s|$)/i)
    const sender = senderMatch ? senderMatch[1] : null
    return (
      <>
        <DetailRow label="Betrag">{fmt(tx.amount)}€</DetailRow>
        {sender && <DetailRow label="Absender">{sender}</DetailRow>}
      </>
    )
  }

  return <p className="text-gray-600 text-sm">Keine Details verfügbar</p>
}

export default function Transactions() {
  const [transactions, setTransactions] = useState([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)

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

  const handleExport = async (format) => {
    try {
      const res = await api.get(`/account/transactions/export/${format}`, { responseType: 'blob' })
      const blob = new Blob([res.data], {
        type: format === 'pdf' ? 'application/pdf' : 'text/csv; charset=utf-8',
      })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const date = new Date().toISOString().split('T')[0]
      a.download = `Kontoauszug_${date}.${format}`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      const detail = err.response?.data?.detail || err.response?.status || err.message
      alert(`Export fehlgeschlagen: ${detail}`)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Kontoauszug</h1>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('csv')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-dark-card border border-dark-border text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
          >
            CSV
          </button>
          <button
            onClick={() => handleExport('pdf')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-dark-card border border-dark-border text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
          >
            PDF
          </button>
        </div>
      </div>

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
            <div key={tx.id}>
              <div
                onClick={() => setExpandedId(expandedId === tx.id ? null : tx.id)}
                className="flex items-center gap-3 md:gap-4 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
              >
                {/* Icon */}
                <div className={`w-8 h-8 text-xs md:w-10 md:h-10 md:text-sm rounded-full flex items-center justify-center font-bold shrink-0 ${typeBgColor(tx.type)}`}>
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

                {/* Chevron */}
                <span className={`text-gray-500 text-sm transition-transform duration-200 ${expandedId === tx.id ? 'rotate-180' : ''}`}>
                  ▾
                </span>
              </div>

              {/* Aufklappbarer Detail-Bereich */}
              {expandedId === tx.id && (
                <div className="px-4 pb-4">
                  <div className="bg-dark-bg rounded-xl p-4 ml-8 md:ml-14">
                    <TradeDetails tx={tx} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
