/**
 * PositionDetailModal: Detailansicht einer gehaltenen Position.
 * Zeigt Positionsübersicht, Finanzen, Liquidation und Finanzierungskosten.
 */

import { Link } from 'react-router-dom'
import PriceTag from './PriceTag'

const ASSET_TYPE_LABELS = {
  stock: 'Aktie',
  etf: 'ETF',
  crypto: 'Krypto',
  index: 'Index',
}

function Row({ label, children, className = '' }) {
  return (
    <div className={`flex justify-between items-center py-1.5 ${className}`}>
      <span className="text-gray-500 text-sm">{label}</span>
      <span className="text-white text-sm text-right">{children}</span>
    </div>
  )
}

function Section({ title, color = 'text-gray-400', children }) {
  return (
    <div className="mt-4">
      <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${color}`}>{title}</p>
      <div className="bg-dark-bg rounded-xl p-3">{children}</div>
    </div>
  )
}

function formatCurrency(value, currency = 'EUR') {
  const symbol = currency === 'USD' ? '$' : '€'
  const formatted = Math.abs(value).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (currency === 'USD') return `${symbol}${formatted}`
  return `${formatted}${symbol}`
}

function formatDate(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function PositionDetailModal({ position, onClose, onSell }) {
  if (!position) return null

  const pos = position
  const leverage = pos.leverage || 1
  const isLeveraged = leverage > 1
  const assetLabel = ASSET_TYPE_LABELS[pos.asset_type] || pos.asset_type || 'Asset'
  const currency = pos.currency || 'USD'
  const currencySymbol = currency === 'USD' ? '$' : '€'

  // Berechnungen
  const positionSize = pos.entry_price * pos.quantity
  const currentValue = pos.margin_used + (pos.unrealized_pnl || 0)
  const pnlPercent = pos.pnl_percent || 0

  // Liquidation - stop_loss_price vom Backend ist der echte Liquidationskurs
  const liquidationPrice = isLeveraged && pos.stop_loss_price ? pos.stop_loss_price : null
  const liquidationDistance = liquidationPrice
    ? pos.current_price - liquidationPrice
    : null
  const liquidationDistancePercent = liquidationPrice && pos.current_price > 0
    ? (liquidationDistance / pos.current_price) * 100
    : null

  // Finanzierungskosten
  const dailyRate = pos.financing_rate || 0
  const annualRate = dailyRate * 365
  const dailyCost = positionSize * dailyRate
  const daysOpen = pos.created_at
    ? Math.max(1, Math.floor((Date.now() - new Date(pos.created_at).getTime()) / (1000 * 60 * 60 * 24)))
    : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-dark-card border border-dark-border rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-dark-card border-b border-dark-border rounded-t-2xl p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-lg">{pos.ticker}</span>
                <span className="text-gray-400">-</span>
                <span className="text-gray-300 text-sm">{pos.name}</span>
                {isLeveraged && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-semibold">
                    {leverage}x
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">{assetLabel} · {currency}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-dark-bg flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          {/* Positionsübersicht */}
          <Section title="Positionsübersicht">
            <Row label="Eröffnet am">{formatDate(pos.created_at)}</Row>
            <Row label="Einstiegskurs">{currencySymbol}{pos.entry_price?.toFixed(2)}</Row>
            <Row label="Aktueller Kurs">{currencySymbol}{pos.current_price?.toFixed(2)}</Row>
            <Row label="Menge">{pos.quantity?.toFixed(4)} Stk.</Row>
            {isLeveraged && (
              <Row label="Hebel">
                <span className="text-yellow-400">{leverage}x</span>
              </Row>
            )}
          </Section>

          {/* Finanzen */}
          <Section title="Finanzen">
            <Row label="Margin-Einsatz">{formatCurrency(pos.margin_used)}</Row>
            <Row label="Positionsgröße">{formatCurrency(positionSize)}</Row>
            <Row label="Aktueller Wert">{formatCurrency(Math.max(currentValue, 0))}</Row>
            <Row label="Unrealisierter P&L">
              <div className="flex items-center gap-2">
                <PriceTag value={pos.unrealized_pnl} showSign className="font-semibold" />
                <span className="text-xs">
                  (<PriceTag value={pnlPercent} suffix="%" showSign />)
                </span>
              </div>
            </Row>
          </Section>

          {/* Liquidation - nur bei Hebel */}
          {isLeveraged && liquidationPrice && (
            <Section title="Liquidation" color="text-accent-red">
              <Row label="Liquidationskurs">
                <span className="text-accent-red">{currencySymbol}{liquidationPrice.toFixed(2)}</span>
              </Row>
              <Row label="Abstand">
                <span className="text-accent-red">
                  {currencySymbol}{liquidationDistance?.toFixed(2)} ({liquidationDistancePercent?.toFixed(2)}%)
                </span>
              </Row>
              <Row label="Liquidation bei">
                <span className="text-gray-400">90% Margin-Verlust</span>
              </Row>
            </Section>
          )}

          {/* Finanzierungskosten - nur bei Hebel */}
          {isLeveraged && dailyRate > 0 && (
            <Section title="Finanzierungskosten" color="text-yellow-400">
              <Row label="Tägliche Rate">
                {(dailyRate * 100).toFixed(3)}% / Tag ({(annualRate * 100).toFixed(1)}% p.a.)
              </Row>
              <Row label="Tägliche Kosten">{formatCurrency(dailyCost)}</Row>
              <Row label="Position offen seit">{daysOpen} {daysOpen === 1 ? 'Tag' : 'Tage'}</Row>
              <Row label="Aufgelaufene Kosten">
                <span className="text-yellow-400">{formatCurrency(pos.accrued_financing || 0)}</span>
              </Row>
            </Section>
          )}

        </div>

        {/* Footer Buttons */}
        <div className="sticky bottom-0 bg-dark-card border-t border-dark-border rounded-b-2xl p-4 flex gap-3">
          <Link
            to={`/asset/${pos.ticker}`}
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl bg-dark-bg border border-dark-border text-gray-400 hover:text-white transition-colors text-center text-sm font-medium"
          >
            Zum Asset
          </Link>
          <button
            onClick={() => onSell(pos)}
            className="flex-1 py-3 px-4 rounded-xl bg-accent-red/10 text-accent-red font-semibold text-sm hover:bg-accent-red/20 transition-colors"
          >
            Verkaufen
          </button>
        </div>
      </div>
    </div>
  )
}
