/**
 * Portfolio-Page: Zeigt alle offenen Positionen mit Live-P&L, Teilverkauf, und Pending Orders.
 */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useWebSocket } from '../hooks/useWebSocket'
import api from '../hooks/api'
import PriceTag from '../components/PriceTag'
import ConfirmModal from '../components/ConfirmModal'

const ORDER_TYPE_LABEL = {
  limit_buy: 'Kauflimit',
  limit_sell: 'Verkauflimit',
  stop_loss: 'Stop-Loss',
}

const ORDER_TYPE_COLOR = {
  limit_buy: 'text-accent-green',
  limit_sell: 'text-blue-400',
  stop_loss: 'text-accent-red',
}

export default function Portfolio() {
  const { user } = useAuth()
  const { data: wsData } = useWebSocket(user?.accountId)
  const [positions, setPositions] = useState([])
  const [orders, setOrders] = useState([])
  const [sellModal, setSellModal] = useState(null)
  const [sellQuantity, setSellQuantity] = useState('')
  const [selling, setSelling] = useState(false)
  const [activeTab, setActiveTab] = useState('positions') // 'positions' | 'orders'
  const [pnlMode, setPnlMode] = useState('pnl_eur') // 'pnl_eur' | 'pnl_pct' | 'day_eur' | 'day_pct'

  const fetchPositions = async () => {
    try {
      const res = await api.get('/account/positions')
      setPositions(res.data)
    } catch (err) {
      // Fehler ignorieren
    }
  }

  const fetchOrders = async () => {
    try {
      const res = await api.get('/orders')
      setOrders(res.data)
    } catch (err) {
      // Fehler ignorieren
    }
  }

  useEffect(() => {
    fetchPositions()
    fetchOrders()
  }, [])

  // Live-Positionen vom WebSocket verwenden
  const livePositions = wsData?.positions ?? positions

  const openSellModal = (pos) => {
    setSellModal(pos)
    setSellQuantity('')
  }

  const handleSell = async (positionId) => {
    setSelling(true)
    try {
      const qty = parseFloat(sellQuantity)
      const payload = { position_id: positionId }
      if (sellQuantity && qty > 0) {
        payload.quantity = qty
      }
      await api.post('/trading/sell', payload)
      setSellModal(null)
      fetchPositions()
      fetchOrders()
    } catch (err) {
      alert(err.response?.data?.detail || 'Verkauf fehlgeschlagen')
    } finally {
      setSelling(false)
    }
  }

  const handleCancelOrder = async (orderId) => {
    try {
      await api.delete(`/orders/${orderId}`)
      fetchOrders()
    } catch (err) {
      alert(err.response?.data?.detail || 'Stornierung fehlgeschlagen')
    }
  }

  const totalPnl = livePositions.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0)
  const pendingOrders = orders.filter((o) => o.status === 'pending')

  // Verkaufsmenge validieren
  const sellQtyNum = parseFloat(sellQuantity)
  const sellQtyValid = !sellQuantity || (sellQtyNum > 0 && sellModal && sellQtyNum <= sellModal.quantity)
  const isSellAll = !sellQuantity || sellQtyNum >= (sellModal?.quantity ?? 0)

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

      {/* Tabs */}
      <div className="flex bg-dark-card border border-dark-border rounded-xl p-1 mb-6">
        <button
          onClick={() => setActiveTab('positions')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'positions' ? 'bg-dark-bg text-white' : 'text-gray-500'
          }`}
        >
          Positionen
          {livePositions.length > 0 && (
            <span className="ml-2 text-xs bg-white/10 px-1.5 py-0.5 rounded-full">
              {livePositions.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'orders' ? 'bg-dark-bg text-white' : 'text-gray-500'
          }`}
        >
          Orders
          {pendingOrders.length > 0 && (
            <span className="ml-2 text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">
              {pendingOrders.length}
            </span>
          )}
        </button>
      </div>

      {/* --- Positionen Tab --- */}
      {activeTab === 'positions' && (
        <>
          {/* P&L Modus Toggle */}
          {livePositions.length > 0 && (
            <div className="flex bg-dark-card border border-dark-border rounded-xl p-1 mb-4 text-xs">
              {[
                { key: 'pnl_eur', label: 'Gewinn €' },
                { key: 'pnl_pct', label: 'Gewinn %' },
                { key: 'day_eur', label: 'Tag €' },
                { key: 'day_pct', label: 'Tag %' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setPnlMode(key)}
                  className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
                    pnlMode === key ? 'bg-dark-bg text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {livePositions.length === 0 ? (
            <div className="bg-dark-card border border-dark-border rounded-2xl p-12 text-center">
              <p className="text-gray-500 mb-4">Du hast noch keine offenen Positionen</p>
              <Link to="/market" className="text-accent-green hover:underline">
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
                      {pnlMode === 'pnl_eur' && (
                        <PriceTag value={pos.unrealized_pnl} showSign suffix="€" className="font-semibold" />
                      )}
                      {pnlMode === 'pnl_pct' && (
                        <PriceTag value={pos.pnl_percent} showSign suffix="%" className="font-semibold" />
                      )}
                      {pnlMode === 'day_eur' && (
                        pos.day_change_eur != null
                          ? <PriceTag value={pos.day_change_eur} showSign suffix="€" className="font-semibold" />
                          : <span className="text-gray-600 font-semibold text-sm">–</span>
                      )}
                      {pnlMode === 'day_pct' && (
                        pos.day_change_percent != null
                          ? <PriceTag value={pos.day_change_percent} showSign suffix="%" className="font-semibold" />
                          : <span className="text-gray-600 font-semibold text-sm">–</span>
                      )}
                      {pos.accrued_financing > 0 && (
                        <p className="text-xs text-gray-600 mt-0.5">
                          Fin: -{pos.accrued_financing?.toFixed(2)}€
                        </p>
                      )}
                    </div>

                    {/* Verkaufen Button */}
                    <button
                      onClick={() => openSellModal(pos)}
                      className="ml-4 px-4 py-2 rounded-xl bg-accent-red/10 text-accent-red text-sm font-medium hover:bg-accent-red/20 transition-colors"
                    >
                      Verkaufen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* --- Orders Tab --- */}
      {activeTab === 'orders' && (
        <>
          {orders.length === 0 ? (
            <div className="bg-dark-card border border-dark-border rounded-2xl p-12 text-center">
              <p className="text-gray-500 mb-2">Keine Orders vorhanden</p>
              <p className="text-xs text-gray-600">
                Kauflimits, Verkauflimits und Stop-Loss kannst du auf der Asset-Seite setzen.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="bg-dark-card border border-dark-border rounded-2xl p-4 flex items-center justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-semibold ${ORDER_TYPE_COLOR[order.order_type]}`}>
                        {ORDER_TYPE_LABEL[order.order_type]}
                      </span>
                      <span className="text-white font-medium">{order.ticker}</span>
                      {order.leverage > 1 && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                          {order.leverage}x
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        order.status === 'pending'
                          ? 'bg-blue-500/20 text-blue-400'
                          : order.status === 'executed'
                          ? 'bg-green-500/20 text-accent-green'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {order.status === 'pending' ? 'Ausstehend'
                          : order.status === 'executed' ? 'Ausgeführt'
                          : 'Storniert'}
                      </span>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>Limit: <span className="text-white">{order.limit_price?.toFixed(2)}</span></span>
                      {order.amount_eur && <span>Betrag: <span className="text-white">{order.amount_eur?.toFixed(2)}€</span></span>}
                      {order.sell_quantity && <span>Menge: <span className="text-white">{order.sell_quantity?.toFixed(4)}</span></span>}
                      <span>{new Date(order.created_at).toLocaleDateString('de-DE')}</span>
                    </div>
                  </div>
                  {order.status === 'pending' && (
                    <button
                      onClick={() => handleCancelOrder(order.id)}
                      className="ml-4 px-3 py-1.5 rounded-lg bg-dark-bg border border-dark-border text-gray-400 text-xs hover:text-white hover:border-gray-500 transition-colors"
                    >
                      Stornieren
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Sell Modal mit Teilverkauf */}
      {sellModal && (
        <ConfirmModal
          isOpen={true}
          title={`${sellModal.name} verkaufen`}
          onConfirm={() => handleSell(sellModal.id)}
          onCancel={() => setSellModal(null)}
          confirmText={isSellAll ? 'Alles verkaufen' : `${sellQtyNum?.toFixed(4)} Stk. verkaufen`}
          loading={selling}
          disabled={!sellQtyValid}
        >
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Ticker</span>
              <span className="text-white">{sellModal.ticker}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Gesamtmenge</span>
              <span className="text-white">{sellModal.quantity?.toFixed(4)} Stk.</span>
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

            {/* Teilverkauf */}
            <div className="border-t border-dark-border pt-3">
              <label className="block text-gray-400 mb-1">
                Anzahl verkaufen
                <span className="text-gray-600 ml-1">(leer lassen = alles)</span>
              </label>
              <input
                type="number"
                value={sellQuantity}
                onChange={(e) => setSellQuantity(e.target.value)}
                placeholder={`Max. ${sellModal.quantity?.toFixed(4)}`}
                min="0"
                max={sellModal.quantity}
                step="0.0001"
                className={`w-full bg-dark-bg border rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none transition-colors ${
                  !sellQtyValid ? 'border-accent-red' : 'border-dark-border focus:border-accent-green'
                }`}
              />
              {!sellQtyValid && (
                <p className="text-xs text-accent-red mt-1">
                  Menge überschreitet Positionsgröße
                </p>
              )}
              {/* Quick-Select Buttons */}
              <div className="flex gap-2 mt-2">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => setSellQuantity((sellModal.quantity * pct / 100).toFixed(4))}
                    className="flex-1 py-1.5 text-xs rounded-lg bg-dark-bg border border-dark-border text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

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
