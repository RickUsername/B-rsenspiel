/**
 * Market/Search-Page: Suche nach Assets mit Live-Ergebnissen.
 */

import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import api from '../hooks/api'

export default function MarketSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [popularAssets] = useState([
    { ticker: 'AAPL', name: 'Apple Inc.' },
    { ticker: 'MSFT', name: 'Microsoft Corp.' },
    { ticker: 'GOOGL', name: 'Alphabet Inc.' },
    { ticker: 'AMZN', name: 'Amazon.com Inc.' },
    { ticker: 'TSLA', name: 'Tesla Inc.' },
    { ticker: 'BTC-USD', name: 'Bitcoin' },
    { ticker: 'ETH-USD', name: 'Ethereum' },
    { ticker: 'SAP.DE', name: 'SAP SE' },
    { ticker: '^GSPC', name: 'S&P 500' },
    { ticker: '^GDAXI', name: 'DAX' },
  ])
  const debounceRef = useRef(null)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    // Debounce: 300ms warten
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await api.get(`/market/search?q=${encodeURIComponent(query)}`)
        setResults(res.data)
      } catch (err) {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const assetTypeLabel = (type) => {
    const labels = {
      stock: 'Aktie',
      etf: 'ETF',
      crypto: 'Krypto',
      index: 'Index',
    }
    return labels[type] || type
  }

  const assetTypeColor = (type) => {
    const colors = {
      stock: 'bg-blue-500/20 text-blue-400',
      etf: 'bg-purple-500/20 text-purple-400',
      crypto: 'bg-orange-500/20 text-orange-400',
      index: 'bg-green-500/20 text-green-400',
    }
    return colors[type] || 'bg-gray-500/20 text-gray-400'
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-white mb-6">Markt</h1>

      {/* Suchleiste */}
      <div className="relative mb-8">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Aktie, ETF, Krypto oder Index suchen..."
          className="w-full bg-dark-card border border-dark-border rounded-2xl px-5 py-3 text-base md:py-4 md:text-lg text-white placeholder-gray-600 focus:outline-none focus:border-accent-green transition-colors"
        />
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 border-2 border-gray-600 border-t-accent-green rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Suchergebnisse */}
      {query.trim() && results.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm text-gray-500 mb-3">Suchergebnisse</h2>
          <div className="bg-dark-card border border-dark-border rounded-2xl divide-y divide-dark-border">
            {results.map((item) => (
              <Link
                key={item.ticker}
                to={`/asset/${item.ticker}`}
                className="flex items-center justify-between p-4 hover:bg-dark-hover transition-colors first:rounded-t-2xl last:rounded-b-2xl"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-white font-medium">{item.ticker}</p>
                    <p className="text-xs text-gray-500">{item.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${assetTypeColor(item.asset_type)}`}>
                    {assetTypeLabel(item.asset_type)}
                  </span>
                  {item.exchange && (
                    <span className="text-xs text-gray-600">{item.exchange}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {query.trim() && results.length === 0 && !loading && (
        <div className="bg-dark-card border border-dark-border rounded-2xl p-8 text-center mb-8">
          <p className="text-gray-500">Keine Ergebnisse für "{query}"</p>
        </div>
      )}

      {/* Beliebte Assets */}
      {!query.trim() && (
        <div>
          <h2 className="text-sm text-gray-500 mb-3">Beliebte Assets</h2>
          <div className="bg-dark-card border border-dark-border rounded-2xl divide-y divide-dark-border">
            {popularAssets.map((item) => (
              <Link
                key={item.ticker}
                to={`/asset/${item.ticker}`}
                className="flex items-center justify-between p-4 hover:bg-dark-hover transition-colors first:rounded-t-2xl last:rounded-b-2xl"
              >
                <div>
                  <p className="text-white font-medium">{item.ticker}</p>
                  <p className="text-xs text-gray-500">{item.name}</p>
                </div>
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
