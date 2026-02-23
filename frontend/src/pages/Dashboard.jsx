/**
 * Dashboard: Übersicht mit Gesamtportfoliowert, Portfolio-Chart, Watchlist und letzten Transaktionen.
 */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useAuth } from '../context/AuthContext'
import { useWebSocket } from '../hooks/useWebSocket'
import api from '../hooks/api'
import PriceTag from '../components/PriceTag'
import DepositModal from '../components/DepositModal'

const HISTORY_RANGES = [
  { label: '1H',  range: '1H' },
  { label: '1T',  range: '1T' },
  { label: '1W',  range: '1W' },
  { label: '1M',  range: '1M' },
  { label: '1J',  range: '1J' },
  { label: 'MAX', range: 'MAX' },
]

export default function Dashboard() {
  const { user } = useAuth()
  const { data: wsData } = useWebSocket(user?.accountId)
  const [balance, setBalance] = useState(null)
  const [watchlist, setWatchlist] = useState([])
  const [transactions, setTransactions] = useState([])
  const [showDeposit, setShowDeposit] = useState(false)
  const [historyData, setHistoryData] = useState([])
  const [historyRange, setHistoryRange] = useState(2) // default: 1W
  const [watchlistExpanded, setWatchlistExpanded] = useState(false)
  const [watchlistSort, setWatchlistSort] = useState('default') // 'default' | 'day_desc' | 'day_asc'

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

  const fetchHistory = async (rangeKey) => {
    try {
      const res = await api.get(`/account/portfolio-history?range=${rangeKey}`)
      setHistoryData(res.data)
    } catch (err) {
      setHistoryData([])
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    fetchHistory(HISTORY_RANGES[historyRange].range)
    // Minütliche Chart-Aktualisierung
    const interval = setInterval(() => {
      fetchHistory(HISTORY_RANGES[historyRange].range)
    }, 60_000)
    return () => clearInterval(interval)
  }, [historyRange])

  // Live-Daten vom WebSocket übernehmen
  const totalValue = wsData?.total_value ?? balance?.total_value ?? 0
  const portfolioValue = wsData?.portfolio_value ?? balance?.portfolio_value ?? 0
  const cashBalance = wsData?.balance ?? balance?.balance ?? 0

  // Chart-Farbe: grün wenn aktueller Wert >= Startwert
  const firstValue = historyData[0]?.total_value ?? totalValue
  const chartColor = totalValue >= firstValue ? '#00c805' : '#ff4444'

  // Gewinn/Verlust seit Beginn des gewählten Zeitraums
  const periodPnl = historyData.length > 1 ? totalValue - firstValue : null

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Gesamtportfoliowert */}
      <div className="mb-2">
        <p className="text-sm text-gray-500 mb-1">Gesamtportfoliowert</p>
        <h1 className="text-4xl font-bold text-white">
          {totalValue.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
        </h1>
        {periodPnl !== null && (
          <div className="mt-1">
            <PriceTag value={periodPnl} showSign className="text-sm" />
            <span className="text-xs text-gray-500 ml-2">
              (seit {HISTORY_RANGES[historyRange].label})
            </span>
          </div>
        )}
      </div>

      {/* Portfolio-Chart */}
      <div className="bg-dark-card border border-dark-border rounded-2xl p-4 mb-6">
        {/* Zeitraum-Auswahl */}
        <div className="flex gap-1 mb-3">
          {HISTORY_RANGES.map((r, idx) => (
            <button
              key={r.label}
              onClick={() => setHistoryRange(idx)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                historyRange === idx
                  ? 'bg-white/10 text-white'
                  : 'text-gray-500 hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {historyData.length > 1 ? (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={historyData}>
              <defs>
                <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fill: '#666', fontSize: 10 }}
                tickFormatter={(val) => {
                  const d = new Date(val)
                  const r = HISTORY_RANGES[historyRange].range
                  if (r === '1H' || r === '1T') {
                    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                  }
                  if (r === '1W' || r === '1M') {
                    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
                  }
                  // 1J und MAX: Monat + Jahr
                  return d.toLocaleDateString('de-DE', { month: '2-digit', year: '2-digit' })
                }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fill: '#666', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={65}
                tickFormatter={(v) => `${v.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}€`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #2a2a2a',
                  borderRadius: '12px',
                  color: '#fff',
                  fontSize: '13px',
                }}
                formatter={(val) => [`${val?.toLocaleString('de-DE', { minimumFractionDigits: 2 })}€`, 'Gesamtwert']}
                labelFormatter={(val) => new Date(val).toLocaleString('de-DE')}
              />
              {firstValue && (
                <ReferenceLine y={firstValue} stroke="#333" strokeDasharray="3 3" />
              )}
              <Area
                type="monotone"
                dataKey="total_value"
                stroke={chartColor}
                strokeWidth={2}
                fill="url(#portfolioGradient)"
                dot={false}
                activeDot={{ r: 4, fill: chartColor }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[180px] flex items-center justify-center text-gray-600 text-sm">
            Noch keine Chart-Daten — werden minütlich aufgezeichnet
          </div>
        )}
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
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold text-white">Watchlist</h2>
          <div className="flex items-center gap-3">
            {watchlist.length > 0 && (
              <button
                onClick={() => {
                  const next = watchlistSort === 'default' ? 'day_desc' : watchlistSort === 'day_desc' ? 'day_asc' : 'default'
                  setWatchlistSort(next)
                }}
                className="text-xs text-gray-500 hover:text-white transition-colors flex items-center gap-1"
              >
                {watchlistSort === 'default' && '↕ Sortieren'}
                {watchlistSort === 'day_desc' && '↓ Tag %'}
                {watchlistSort === 'day_asc' && '↑ Tag %'}
              </button>
            )}
            <Link to="/market" className="text-sm text-gray-500 hover:text-white transition-colors">
              Bearbeiten
            </Link>
          </div>
        </div>

        {watchlist.length === 0 ? (
          <div className="bg-dark-card border border-dark-border rounded-2xl p-6 text-center">
            <p className="text-gray-500">Noch keine Assets in der Watchlist</p>
            <Link to="/market" className="text-accent-green text-sm hover:underline mt-2 inline-block">
              Jetzt Assets hinzufügen
            </Link>
          </div>
        ) : (() => {
          const sorted = [...watchlist].sort((a, b) => {
            if (watchlistSort === 'day_desc') return (b.change_percent ?? 0) - (a.change_percent ?? 0)
            if (watchlistSort === 'day_asc') return (a.change_percent ?? 0) - (b.change_percent ?? 0)
            return 0
          })
          const displayed = watchlistExpanded ? sorted : sorted.slice(0, 5)
          return (
            <div className="bg-dark-card border border-dark-border rounded-2xl divide-y divide-dark-border">
              {displayed.map((item) => (
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
              {watchlist.length > 5 && (
                <button
                  onClick={() => setWatchlistExpanded(!watchlistExpanded)}
                  className="w-full py-3 text-sm text-gray-500 hover:text-white transition-colors rounded-b-2xl"
                >
                  {watchlistExpanded ? '▲ Weniger anzeigen' : `▼ Alle ${watchlist.length} anzeigen`}
                </button>
              )}
            </div>
          )
        })()}
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
