/**
 * DepositModal: Modal für Einzahlungen.
 * Mobile: Bottom-Sheet, Desktop: zentriert.
 */

import { useState } from 'react'
import api from '../hooks/api'

export default function DepositModal({ isOpen, onClose, onSuccess }) {
  const [amount, setAmount] = useState('')
  const [sender, setSender] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleDeposit = async () => {
    const numAmount = parseFloat(amount)
    if (!numAmount || numAmount <= 0) {
      setError('Bitte gib einen gültigen Betrag ein')
      return
    }

    setLoading(true)
    setError('')

    try {
      await api.post('/account/deposit', {
        amount: numAmount,
        sender: sender || 'Eigene Überweisung',
      })
      setAmount('')
      setSender('')
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Einzahlung fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-dark-card border border-dark-border rounded-t-2xl md:rounded-2xl p-6 w-full md:max-w-md md:mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-white mb-4">Geld einzahlen</h2>

        {error && (
          <div className="mb-4 p-3 bg-accent-red/10 border border-accent-red/20 rounded-xl text-accent-red text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Betrag (€)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-accent-green transition-colors"
              min="0"
              step="0.01"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Absender</label>
            <input
              type="text"
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              placeholder="z.B. Sparkasse Mustermann"
              className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-accent-green transition-colors"
            />
          </div>

          {/* Schnellauswahl */}
          <div className="flex gap-2">
            {[1000, 5000, 10000, 50000].map((val) => (
              <button
                key={val}
                onClick={() => setAmount(val.toString())}
                className="flex-1 py-2 text-sm rounded-lg bg-dark-bg border border-dark-border text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
              >
                {val.toLocaleString('de-DE')}€
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl bg-dark-bg border border-dark-border text-gray-400 hover:text-white transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleDeposit}
            disabled={loading}
            className="flex-1 py-3 px-4 rounded-xl bg-accent-green text-black font-semibold hover:brightness-110 transition-all disabled:opacity-50"
          >
            {loading ? 'Wird eingezahlt...' : 'Einzahlen'}
          </button>
        </div>
      </div>
    </div>
  )
}
