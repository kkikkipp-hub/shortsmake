import { useEffect, useRef, useCallback } from 'react'
import { useProjectStore } from '../stores/projectStore'
import type { WsMessage } from '../types'

export function useWebSocket(jobId: string | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCount = useRef(0)
  const setProgress = useProjectStore((s) => s.setProgress)

  const connect = useCallback(() => {
    if (!jobId) return
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${location.host}/ws/${jobId}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (e) => {
      try {
        const msg: WsMessage = JSON.parse(e.data)
        setProgress(msg)
        retryCount.current = 0  // 메시지 수신 시 재시도 카운트 초기화
      } catch {}
    }

    ws.onclose = () => {
      wsRef.current = null
      // 자동 재연결 (최대 10회, 지수 백오프)
      if (retryCount.current < 10) {
        const delay = Math.min(1000 * 2 ** retryCount.current, 30000)
        retryCount.current++
        retryRef.current = setTimeout(connect, delay)
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [jobId, setProgress])

  useEffect(() => {
    if (!jobId) return
    retryCount.current = 0
    connect()

    return () => {
      if (retryRef.current) clearTimeout(retryRef.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [jobId, connect])

  return wsRef
}
