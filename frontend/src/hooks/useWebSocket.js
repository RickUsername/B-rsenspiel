/**
 * WebSocket-Hook für Live-Portfolio-Updates.
 */

import { useState, useEffect, useRef, useCallback } from 'react'

export function useWebSocket(accountId) {
  const [data, setData] = useState(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)
  const reconnectTimeout = useRef(null)

  const connect = useCallback(() => {
    if (!accountId) return

    const ws = new WebSocket(`ws://localhost:8000/ws/${accountId}`)

    ws.onopen = () => {
      setConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data)
        setData(parsed)
      } catch (e) {
        // Ignore parse errors
      }
    }

    ws.onclose = () => {
      setConnected(false)
      // Reconnect nach 5 Sekunden
      reconnectTimeout.current = setTimeout(() => {
        connect()
      }, 5000)
    }

    ws.onerror = () => {
      ws.close()
    }

    wsRef.current = ws
  }, [accountId])

  useEffect(() => {
    connect()

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current)
      }
    }
  }, [connect])

  return { data, connected }
}
