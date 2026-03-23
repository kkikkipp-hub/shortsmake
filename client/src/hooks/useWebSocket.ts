import { useEffect, useRef } from 'react'
import { useProjectStore } from '../stores/projectStore'
import type { WsMessage } from '../types'

export function useWebSocket(jobId: string | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const setProgress = useProjectStore((s) => s.setProgress)

  useEffect(() => {
    if (!jobId) return

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${location.host}/ws/${jobId}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (e) => {
      try {
        const msg: WsMessage = JSON.parse(e.data)
        setProgress(msg)
      } catch {}
    }

    ws.onclose = () => {
      wsRef.current = null
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [jobId, setProgress])

  return wsRef
}
