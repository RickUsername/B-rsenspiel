/**
 * PriceTag: Zeigt einen Kurs mit Farbe je nach Vorzeichen.
 */

export default function PriceTag({ value, suffix = '€', showSign = false, className = '' }) {
  const numValue = parseFloat(value) || 0
  const isPositive = numValue > 0
  const isNegative = numValue < 0
  const isZero = numValue === 0

  const colorClass = isPositive
    ? 'text-accent-green'
    : isNegative
    ? 'text-accent-red'
    : 'text-gray-400'

  const sign = showSign && isPositive ? '+' : ''

  return (
    <span className={`${colorClass} ${className}`}>
      {sign}{numValue.toFixed(2)}{suffix}
    </span>
  )
}
