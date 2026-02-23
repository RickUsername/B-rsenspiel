/**
 * LivePnL: WebSocket-verbundene P&L-Anzeige die sich live aktualisiert.
 */

import { useAuth } from '../context/AuthContext'
import { useWebSocket } from '../hooks/useWebSocket'
import PriceTag from './PriceTag'

export default function LivePnL() {
  const { user } = useAuth()
  const { data, connected } = useWebSocket(user?.accountId)

  if (!data) {
    return <span className="text-gray-500 text-sm">Verbinde...</span>
  }

  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <div className="text-xs text-gray-500">Gesamtwert</div>
        <div className="text-sm font-semibold">
          {data.total_value?.toLocaleString('de-DE', { minimumFractionDigits: 2 })}€
        </div>
      </div>
      {connected && (
        <div className="w-2 h-2 rounded-full bg-accent-green animate-pulse" title="Live verbunden" />
      )}
    </div>
  )
}
