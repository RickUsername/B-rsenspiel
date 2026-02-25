/**
 * Asset Detail-Page: Kurs-Chart, aktuelle Daten und Kauf-Panel.
 */

import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import api from '../hooks/api'
import PriceTag from '../components/PriceTag'
import ConfirmModal from '../components/ConfirmModal'

const ORDER_TYPE_OPTIONS = [
  { value: 'limit_buy', label: 'Kauflimit', desc: 'Kauft wenn Preis sinkt auf', color: 'text-accent-green' },
  { value: 'limit_sell', label: 'Verkauflimit', desc: 'Verkauft wenn Preis steigt auf', color: 'text-blue-400' },
  { value: 'stop_loss', label: 'Stop-Loss', desc: 'Verkauft wenn Preis fällt auf', color: 'text-accent-red' },
]

const TIME_RANGES = [
  { label: '1T', period: '1d', interval: '5m' },
  { label: '1W', period: '5d', interval: '15m' },
  { label: '1M', period: '1mo', interval: '1d' },
  { label: '6M', period: '6mo', interval: '1d' },
  { label: '1J', period: '1y', interval: '1wk' },
]

export default function AssetDetail() {
  const { ticker } = useParams()
  const [assetInfo, setAssetInfo] = useState(null)
  const [chartData, setChartData] = useState([])
  const [selectedRange, setSelectedRange] = useState(2) // 1M default
  const [leverageOptions, setLeverageOptions] = useState([1])
  const [selectedLeverage, setSelectedLeverage] = useState(1)
  const [amount, setAmount] = useState('')
  const [buyMode, setBuyMode] = useState('eur') // 'eur' oder 'qty'
  const [showConfirm, setShowConfirm] = useState(false)
  const [buying, setBuying] = useState(false)
  const [inWatchlist, setInWatchlist] = useState(false)
  const [loading, setLoading] = useState(true)
  const [positions, setPositions] = useState([])
  const [activePanel, setActivePanel] = useState('buy') // 'buy' | 'order'
  // Order form state
  const [orderType, setOrderType] = useState('limit_buy')
  const [orderPrice, setOrderPrice] = useState('')
  const [orderAmount, setOrderAmount] = useState('')
  const [orderLeverage, setOrderLeverage] = useState(1)
  const [orderPositionId, setOrderPositionId] = useState('')
  const [orderSellQty, setOrderSellQty] = useState('')
  const [placingOrder, setPlacingOrder] = useState(false)

  useEffect(() => {
    fetchAssetData()
    checkWatchlist()
    fetchPositionsForTicker()
  }, [ticker])

  useEffect(() => {
    fetchChart()
  }, [ticker, selectedRange])

  const fetchAssetData = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/market/price/${ticker}`)
      setAssetInfo(res.data)

      // Hebel laden
      const levRes = await api.get(`/trading/leverage/${res.data.asset_type}`)
      setLeverageOptions(levRes.data.leverage_options)
    } catch (err) {
      // Fehler ignorieren
    } finally {
      setLoading(false)
    }
  }

  const fetchChart = async () => {
    try {
      const range = TIME_RANGES[selectedRange]
      const res = await api.get(`/market/history/${ticker}?period=${range.period}&interval=${range.interval}`)
      setChartData(res.data)
    } catch (err) {
      setChartData([])
    }
  }

  const checkWatchlist = async () => {
    try {
      const res = await api.get('/account/watchlist')
      setInWatchlist(res.data.some(w => w.ticker === ticker))
    } catch (err) {
      // Ignore
    }
  }

  const fetchPositionsForTicker = async () => {
    try {
      const res = await api.get('/account/positions')
      setPositions(res.data.filter(p => p.ticker === ticker))
    } catch (err) {
      // Ignore
    }
  }

  const handlePlaceOrder = async () => {
    const price = parseFloat(orderPrice)
    if (!price || price <= 0) return

    setPlacingOrder(true)
    try {
      const payload = {
        ticker,
        order_type: orderType,
        limit_price: price,
      }
      if (orderType === 'limit_buy') {
        payload.amount_eur = parseFloat(orderAmount)
        payload.leverage = orderLeverage
      } else {
        payload.position_id = parseInt(orderPositionId)
        if (orderSellQty) payload.sell_quantity = parseFloat(orderSellQty)
      }
      await api.post('/orders', payload)
      setOrderPrice('')
      setOrderAmount('')
      setOrderSellQty('')
      alert('Order gesetzt!')
    } catch (err) {
      alert(err.response?.data?.detail || 'Order fehlgeschlagen')
    } finally {
      setPlacingOrder(false)
    }
  }

  const orderTypeInfo = ORDER_TYPE_OPTIONS.find(o => o.value === orderType)

  const toggleWatchlist = async () => {
    try {
      if (inWatchlist) {
        await api.delete(`/account/watchlist/${ticker}`)
      } else {
        await api.post('/account/watchlist', { ticker })
      }
      setInWatchlist(!inWatchlist)
    } catch (err) {
      // Ignore
    }
  }

  const handleBuy = async () => {
    const numAmount = parseFloat(amount)
    if (!numAmount || numAmount <= 0) return

    setBuying(true)
    try {
      let investAmount = numAmount
      if (buyMode === 'qty' && assetInfo) {
        investAmount = numAmount * assetInfo.price / selectedLeverage
      }

      await api.post('/trading/buy', {
        ticker: ticker,
        amount: investAmount,
        leverage: selectedLeverage,
      })
      setShowConfirm(false)
      setAmount('')
      alert('Kauf erfolgreich!')
    } catch (err) {
      alert(err.response?.data?.detail || 'Kauf fehlgeschlagen')
    } finally {
      setBuying(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="animate-pulse">
          <div className="h-8 bg-dark-card rounded w-48 mb-4" />
          <div className="h-64 bg-dark-card rounded-2xl mb-4" />
        </div>
      </div>
    )
  }

  if (!assetInfo) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 text-center text-gray-500">
        Asset nicht gefunden
      </div>
    )
  }

  const change = assetInfo.previous_close
    ? assetInfo.price - assetInfo.previous_close
    : 0
  const changePercent = assetInfo.previous_close
    ? (change / assetInfo.previous_close) * 100
    : 0
  const chartColor = change >= 0 ? '#00c805' : '#ff4444'

  // Berechne Kaufdetails
  const numAmount = parseFloat(amount) || 0
  const marginAmount = buyMode === 'eur' ? numAmount : (numAmount * assetInfo.price / selectedLeverage)
  const positionSize = marginAmount * selectedLeverage
  const quantity = positionSize / assetInfo.price
  const stopLossPrice = selectedLeverage > 1
    ? assetInfo.price - (0.9 * marginAmount) / (quantity * selectedLeverage || 1)
    : null

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{assetInfo.name}</h1>
            <button
              onClick={toggleWatchlist}
              className={`text-lg ${inWatchlist ? 'text-yellow-400' : 'text-gray-600 hover:text-gray-400'} transition-colors`}
              title={inWatchlist ? 'Von Watchlist entfernen' : 'Zur Watchlist hinzufügen'}
            >
              {inWatchlist ? '\u2605' : '\u2606'}
            </button>
          </div>
          <p className="text-sm text-gray-500">{ticker} · {assetInfo.currency}</p>
        </div>
        <div className="text-left md:text-right mt-2 md:mt-0">
          <p className="text-3xl font-bold text-white">
            {assetInfo.price?.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <div className="flex items-center gap-2 md:justify-end">
            <PriceTag value={change} showSign className="text-sm" suffix={` ${assetInfo.currency}`} />
            <PriceTag value={changePercent} showSign className="text-sm" suffix="%" />
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-dark-card border border-dark-border rounded-2xl p-4 mb-6">
        {/* Zeitraum-Auswahl */}
        <div className="flex gap-1 mb-4">
          {TIME_RANGES.map((range, idx) => (
            <button
              key={range.label}
              onClick={() => setSelectedRange(idx)}
              className={`px-2.5 py-1.5 text-xs md:px-3 md:text-sm rounded-lg font-medium transition-colors ${
                selectedRange === idx
                  ? 'bg-white/10 text-white'
                  : 'text-gray-500 hover:text-white'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>

        {chartData.length > 0 ? (
          <div className="h-[220px] md:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis
                dataKey="date"
                tick={{ fill: '#666', fontSize: 11 }}
                tickFormatter={(val) => {
                  const d = new Date(val)
                  if (selectedRange <= 1) return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
                }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fill: '#666', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={60}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #2a2a2a',
                  borderRadius: '12px',
                  color: '#fff',
                  fontSize: '13px',
                }}
                formatter={(val) => [val?.toFixed(2), 'Kurs']}
                labelFormatter={(val) => new Date(val).toLocaleString('de-DE')}
              />
              {assetInfo.previous_close && (
                <ReferenceLine
                  y={assetInfo.previous_close}
                  stroke="#333"
                  strokeDasharray="3 3"
                />
              )}
              <Line
                type="monotone"
                dataKey="close"
                stroke={chartColor}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: chartColor }}
              />
            </LineChart>
          </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[220px] md:h-[300px] flex items-center justify-center text-gray-500">
            Keine Chart-Daten verfügbar
          </div>
        )}
      </div>

      {/* Panel Toggle: Kaufen / Order */}
      <div className="flex bg-dark-card border border-dark-border rounded-xl p-1 mb-4">
        <button
          onClick={() => setActivePanel('buy')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
            activePanel === 'buy' ? 'bg-dark-bg text-white' : 'text-gray-500'
          }`}
        >
          Kaufen
        </button>
        <button
          onClick={() => setActivePanel('order')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
            activePanel === 'order' ? 'bg-dark-bg text-white' : 'text-gray-500'
          }`}
        >
          Order aufgeben
        </button>
      </div>

      {/* Kauf-Panel */}
      {activePanel === 'buy' && (
      <div className="bg-dark-card border border-dark-border rounded-2xl p-4 md:p-6">
        <h2 className="text-lg font-semibold text-white mb-4">{assetInfo.name} kaufen</h2>

        <div className="space-y-4">
          {/* Betrag / Anzahl Toggle */}
          <div className="flex bg-dark-bg rounded-xl p-1 mb-2">
            <button
              onClick={() => setBuyMode('eur')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                buyMode === 'eur' ? 'bg-dark-card text-white' : 'text-gray-500'
              }`}
            >
              Betrag (€)
            </button>
            <button
              onClick={() => setBuyMode('qty')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                buyMode === 'qty' ? 'bg-dark-card text-white' : 'text-gray-500'
              }`}
            >
              Anzahl (Stk.)
            </button>
          </div>

          {/* Betrag eingeben */}
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={buyMode === 'eur' ? 'Betrag in €' : 'Anzahl Stücke'}
            className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-accent-green transition-colors"
            min="0"
            step={buyMode === 'eur' ? '1' : '0.0001'}
          />

          {/* Schnellauswahl */}
          {buyMode === 'eur' && (
            <div className="flex gap-2">
              {[50, 100, 500, 1000].map((val) => (
                <button
                  key={val}
                  onClick={() => setAmount(val.toString())}
                  className="flex-1 py-2 text-sm rounded-lg bg-dark-bg border border-dark-border text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                >
                  {val}€
                </button>
              ))}
            </div>
          )}

          {/* Hebel-Auswahl */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Hebel</label>
            <div className="flex gap-2">
              {leverageOptions.map((lev) => (
                <button
                  key={lev}
                  onClick={() => setSelectedLeverage(lev)}
                  className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${
                    selectedLeverage === lev
                      ? 'border-accent-green text-accent-green bg-accent-green/10'
                      : 'border-dark-border text-gray-400 hover:text-white'
                  }`}
                >
                  {lev}x
                </button>
              ))}
            </div>
          </div>

          {/* Kauf-Details */}
          {numAmount > 0 && (
            <div className="bg-dark-bg rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Margin-Einsatz</span>
                <span className="text-white">{marginAmount.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Positionsgröße</span>
                <span className="text-white">{positionSize.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Anzahl</span>
                <span className="text-white">{quantity.toFixed(4)} Stk.</span>
              </div>
              {stopLossPrice && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Geschätzter Liquidationskurs</span>
                  <span className="text-accent-red">{stopLossPrice.toFixed(2)}</span>
                </div>
              )}
              {selectedLeverage > 1 && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Financing-Rate (p.a.)</span>
                  <span className="text-gray-300">~5.5%</span>
                </div>
              )}
              <div className="flex justify-between border-t border-dark-border pt-2">
                <span className="text-gray-400">Gebühr</span>
                <span className="text-gray-300">1,00€</span>
              </div>
            </div>
          )}

          {/* Kaufen Button */}
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!numAmount || numAmount <= 0}
            className="w-full py-3 rounded-xl bg-accent-green text-black font-semibold hover:brightness-110 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Kaufen
          </button>
        </div>
      </div>
      )}

      {/* Order-Panel */}
      {activePanel === 'order' && (
      <div className="bg-dark-card border border-dark-border rounded-2xl p-4 md:p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Order aufgeben</h2>

        <div className="space-y-4">
          {/* Order-Typ */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Order-Typ</label>
            <div className="space-y-2">
              {ORDER_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setOrderType(opt.value)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors text-left ${
                    orderType === opt.value
                      ? 'border-white/30 bg-white/5'
                      : 'border-dark-border hover:border-gray-500'
                  }`}
                >
                  <span className={`font-medium ${opt.color}`}>{opt.label}</span>
                  <span className="text-xs text-gray-500">{opt.desc} ...</span>
                </button>
              ))}
            </div>
          </div>

          {/* Auslösepreis */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              {orderTypeInfo?.desc ?? 'Auslösepreis'}
            </label>
            <div className="relative">
              <input
                type="number"
                value={orderPrice}
                onChange={(e) => setOrderPrice(e.target.value)}
                placeholder={`Aktuell: ${assetInfo.price?.toFixed(2)}`}
                className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-accent-green transition-colors"
                min="0"
                step="0.01"
              />
            </div>
            {/* Schnell-Buttons relativ zum aktuellen Kurs */}
            <div className="flex gap-2 mt-2">
              {(orderType === 'limit_sell'
                ? [+1, +2, +5, +10]
                : [-1, -2, -5, -10]
              ).map((pct) => (
                <button
                  key={pct}
                  onClick={() => setOrderPrice((assetInfo.price * (1 + pct / 100)).toFixed(2))}
                  className="flex-1 py-1.5 text-xs rounded-lg bg-dark-bg border border-dark-border text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                >
                  {pct > 0 ? '+' : ''}{pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Kauflimit: Betrag + Hebel */}
          {orderType === 'limit_buy' && (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Betrag (€)</label>
                <input
                  type="number"
                  value={orderAmount}
                  onChange={(e) => setOrderAmount(e.target.value)}
                  placeholder="Betrag in €"
                  className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-accent-green transition-colors"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Hebel</label>
                <div className="flex gap-2">
                  {leverageOptions.map((lev) => (
                    <button
                      key={lev}
                      onClick={() => setOrderLeverage(lev)}
                      className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${
                        orderLeverage === lev
                          ? 'border-accent-green text-accent-green bg-accent-green/10'
                          : 'border-dark-border text-gray-400 hover:text-white'
                      }`}
                    >
                      {lev}x
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Verkauf-Order: Position auswählen */}
          {(orderType === 'limit_sell' || orderType === 'stop_loss') && (
            <>
              {positions.length === 0 ? (
                <div className="bg-dark-bg rounded-xl p-4 text-center text-sm text-gray-500">
                  Keine offenen Positionen in {ticker}
                </div>
              ) : (
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Position</label>
                  <div className="space-y-2">
                    {positions.map((pos) => (
                      <button
                        key={pos.id}
                        onClick={() => setOrderPositionId(pos.id.toString())}
                        className={`w-full flex justify-between items-center px-4 py-3 rounded-xl border transition-colors ${
                          orderPositionId === pos.id.toString()
                            ? 'border-white/30 bg-white/5'
                            : 'border-dark-border hover:border-gray-500'
                        }`}
                      >
                        <span className="text-white text-sm">
                          {pos.quantity?.toFixed(4)} Stk. @ {pos.entry_price?.toFixed(2)}
                          {pos.leverage > 1 && (
                            <span className="ml-2 text-xs text-yellow-400">{pos.leverage}x</span>
                          )}
                        </span>
                        <PriceTag value={pos.unrealized_pnl} showSign className="text-xs" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {orderPositionId && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Anzahl verkaufen
                    <span className="text-gray-600 ml-1">(leer = alles)</span>
                  </label>
                  <input
                    type="number"
                    value={orderSellQty}
                    onChange={(e) => setOrderSellQty(e.target.value)}
                    placeholder="Menge (optional)"
                    className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-accent-green transition-colors"
                    min="0"
                    step="0.0001"
                  />
                </div>
              )}
            </>
          )}

          {/* Order absenden */}
          <button
            onClick={handlePlaceOrder}
            disabled={
              placingOrder ||
              !orderPrice ||
              parseFloat(orderPrice) <= 0 ||
              (orderType === 'limit_buy' && (!orderAmount || parseFloat(orderAmount) <= 0)) ||
              (orderType !== 'limit_buy' && !orderPositionId)
            }
            className="w-full py-3 rounded-xl bg-accent-green text-black font-semibold hover:brightness-110 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {placingOrder ? 'Wird gesetzt...' : 'Order aufgeben'}
          </button>
        </div>
      </div>
      )}

      {/* Bestätigungs-Modal */}
      <ConfirmModal
        isOpen={showConfirm}
        title={`${assetInfo.name} kaufen`}
        onConfirm={handleBuy}
        onCancel={() => setShowConfirm(false)}
        confirmText="Kauf bestätigen"
        loading={buying}
      >
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Asset</span>
            <span className="text-white">{assetInfo.name} ({ticker})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Kurs</span>
            <span className="text-white">{assetInfo.price?.toFixed(2)} {assetInfo.currency}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Margin-Einsatz</span>
            <span className="text-white">{marginAmount.toFixed(2)}€</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Positionsgröße</span>
            <span className="text-white">{positionSize.toFixed(2)}€</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Anzahl</span>
            <span className="text-white">{quantity.toFixed(4)} Stk.</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Hebel</span>
            <span className={selectedLeverage > 1 ? 'text-yellow-400' : 'text-white'}>{selectedLeverage}x</span>
          </div>
          <div className="flex justify-between border-t border-dark-border pt-2 mt-2">
            <span className="text-gray-400">Gebühr</span>
            <span className="text-gray-300">1,00€</span>
          </div>
        </div>
      </ConfirmModal>
    </div>
  )
}
