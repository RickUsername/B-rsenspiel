/**
 * ConfirmModal: Wiederverwendbares Bestätigungs-Modal.
 */

export default function ConfirmModal({ isOpen, title, children, onConfirm, onCancel, confirmText = 'Bestätigen', cancelText = 'Abbrechen', loading = false, disabled = false }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      {/* Modal */}
      <div className="relative bg-dark-card border border-dark-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-4">{title}</h2>

        <div className="mb-6">{children}</div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 px-4 rounded-xl bg-dark-bg border border-dark-border text-gray-400 hover:text-white transition-colors"
            disabled={loading}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 px-4 rounded-xl bg-accent-green text-black font-semibold hover:brightness-110 transition-all disabled:opacity-50"
            disabled={loading || disabled}
          >
            {loading ? 'Wird ausgeführt...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
