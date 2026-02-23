/**
 * Portfolio-Page: Zeigt alle offenen Positionen mit Live-P&L.
 */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useWebSocket } from '../hooks/useWebSocket'
import api from '../hooks/api'
import PriceTag from '../components/PriceTag'
import ConfirmModal from '../components/ConfirmModal'

export default function Portfolio() {
  const { user } = useAuth()
  const { data: wsData } = useWebSocket(user?.accountId)
  const [positions, setPositions] = useState([])
  const [sellModal, setSellModal] = useState(null)
  const [selling, setSelling] = useState(false)

  const fetchPositions = async () => {
    try {
      const res = await api.get('/account/positions')
      setPositions(res.data)
    } catch (err) {
      // Fehler ignorieren
    }
  }

  useEffect(() => {
    fetchPositions()
  }, [])

  // Live-Positionen vom WebSocket verwenden
  const livePositions = wsData?.positions ?? positions

  const handleSell = async (positionId) => {
    setSelling(true)
    try {
      await api.post('/trading/sell', { position_id: positionId })
      setSellModal(null)
      fetchPositions()
    } catch (err) {
      alert(err.response?.data?.detail || 'Verkauf fehlgeschlagen')
    } finally {
      setSelling(false)
    }
  }

  const totalPnl = livePositions.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0)

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Portfolio</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-500">Unrealisierter Gewinn/Verlust:</span>
            <PriceTag value={totalPnl} showSign className="text-sm font-semibold" />
          </div>
        </div>
        <Link
          to="/market"
          className="px-4 py-2 rounded-xl bg-accent-green text-black font-semibold text-sm hover:brightness-110 transition-all"
        >
          + Kaufen
        </Link>
      </div>

      {livePositions.length === 0 ? (
        <div className="bg-dark-card border border-dark-border rounded-2xl p-12 text-center">
          <p className="text-gray-500 mb-4">Du hast noch keine offenen Positionen</p>
          <Link
            to="/market"
            className="text-accent-green hover:underline"
          >
            Jetzt Assets kaufen
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {livePositions.map((pos) => (
            <div
              key={pos.id}
              className="bg-dark-card border border-dark-border rounded-2xl p-4"
            >
              <div className="flex items-center justify-between">
                {/* Asset Info */}
                <Link to={`/asset/${pos.ticker}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-semibold">{pos.ticker}</span>
                        {pos.leverage > 1 && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                            {pos.leverage}x
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{pos.name}</p>
                    </div>
                  </div>
                </Link>

                {/* Menge & Preise */}
                <div className="text-right mx-4">
                  <p className="text-xs text-gray-500">
                    {pos.quantity?.toFixed(4)} Stk. @ {pos.entry_price?.toFixed(2)}
                  </p>
                  <p className="text-sm text-white">
                    Aktuell: {pos.current_price?.toFixed(2)}
                  </p>
                </div>

                {/* P&L */}
                <div className="text-right mx-4 min-w-[100px]">
                  <PriceTag
                    value={pos.unrealized_pnl}
                    showSign
                    className="font-semibold"
                  />
                  <div className="text-xs">
                    <PriceTag
                      value={pos.pnl_percent}
                      suffix="%"
                      showSign
                    />
                  </div>
                  {pos.accrued_financing > 0 && (
                    <p className="text-xs text-gray-600 mt-0.5">
                      Fin: -{pos.accrued_financing?.toFixed(2)}€
                    </p>
                  )}
                </div>

                {/* Verkaufen Button */}
                <button
                  onClick={() => setSellModal(pos)}
                  className="ml-4 px-4 py-2 rounded-xl bg-accent-red/10 text-accent-red text-sm font-medium hover:bg-accent-red/20 transition-colors"
                >
                  Verkaufen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sell Modal */}
      {sellModal && (
        <ConfirmModal
          isOpen={true}
          title={`${sellModal.name} verkaufen?`}
          onConfirm={() => handleSell(sellModal.id)}
          onCancel={() => setSellModal(null)}
          confirmText="Jetzt verkaufen"
          loading={selling}
        >
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Ticker</span>
              <span className="text-white">{sellModal.ticker}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Menge</span>
              <span className="text-white">{sellModal.quantity?.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Einstiegskurs</span>
              <span className="text-white">{sellModal.entry_price?.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Aktueller Kurs</span>
              <span className="text-white">{sellModal.current_price?.toFixed(2)}</span>
            </div>
            {sellModal.leverage > 1 && (
              <div className="flex justify-between">
                <span className="text-gray-400">Hebel</span>
                <span className="text-yellow-400">{sellModal.leverage}x</span>
              </div>
            )}
            <div className="flex justify-between border-t border-dark-border pt-2 mt-2">
              <span className="text-gray-400">Unrealisierter P&L</span>
              <PriceTag value={sellModal.unrealized_pnl} showSign className="font-semibold" />
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Gebühr</span>
              <span className="text-gray-400">1,00€</span>
            </div>
          </div>
        </ConfirmModal>
      )}
    </div>
  )
}
