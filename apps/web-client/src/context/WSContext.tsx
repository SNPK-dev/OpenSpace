import React, { createContext, useContext, useEffect, useRef, useCallback, useState } from 'react'
import { api, getActiveWsBase, getToken } from '../api/client'
import type { WSEvent } from '../api/types'

type EventHandler = (event: WSEvent) => void

interface WSContextValue {
  connected: boolean
  subscribe: (type: string, handler: EventHandler) => () => void
}

const WSContext = createContext<WSContextValue | null>(null)

const PING_INTERVAL = 25_000
const RECONNECT_DELAY = 3_000

export function WSProvider({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const handlersRef = useRef<Map<string, Set<EventHandler>>>(new Map())
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const emit = useCallback((event: WSEvent) => {
    const set = handlersRef.current.get(event.type)
    set?.forEach(h => h(event))
    const all = handlersRef.current.get('*')
    all?.forEach(h => h(event))
  }, [])

  const connect = useCallback(async () => {
    if (!mountedRef.current || !enabled) return
    const token = getToken()
    if (!token) {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY)
      return
    }

    let ticket: string
    try {
      ticket = (await api.realtime.ticket()).ticket
    } catch {
      reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY)
      return
    }
    if (!mountedRef.current) return
    const activeWsBase = getActiveWsBase()
    const wsBase = activeWsBase || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
    const ws = new WebSocket(`${wsBase}/ws`, ['openspace.v1', `ticket.${ticket}`])
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current || ws !== wsRef.current) return
      setConnected(true)
      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
      }, PING_INTERVAL)
    }

    ws.onmessage = (ev) => {
      try {
        const event = JSON.parse(ev.data as string) as WSEvent
        if (event.type !== 'pong') emit(event)
      } catch {/* ignore malformed frames */}
    }

    // Guard against double-fire: onerror fires, then onclose fires independently.
    // Without the guard, two setTimeout(connect) calls pile up and the number of
    // concurrent WS connections doubles on every failed attempt.
    let didClose = false
    ws.onclose = () => {
      if (didClose || !mountedRef.current || ws !== wsRef.current) return
      didClose = true
      setConnected(false)
      if (pingTimerRef.current) { clearInterval(pingTimerRef.current); pingTimerRef.current = null }
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY)
    }

    // Do NOT call ws.close() here — the browser closes the socket after onerror
    // and fires onclose exactly once. A manual ws.close() can trigger a second onclose.
    ws.onerror = () => { /* onclose handles cleanup */ }
  }, [enabled, emit])

  useEffect(() => {
    mountedRef.current = true
    if (enabled) connect()
    return () => {
      mountedRef.current = false
      if (pingTimerRef.current) clearInterval(pingTimerRef.current)
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
    }
  }, [enabled, connect])

  const subscribe = useCallback((type: string, handler: EventHandler) => {
    if (!handlersRef.current.has(type)) handlersRef.current.set(type, new Set())
    handlersRef.current.get(type)!.add(handler)
    return () => {
      handlersRef.current.get(type)?.delete(handler)
    }
  }, [])

  return (
    <WSContext.Provider value={{ connected, subscribe }}>
      {children}
    </WSContext.Provider>
  )
}

export function useWS(): WSContextValue {
  const ctx = useContext(WSContext)
  if (!ctx) throw new Error('useWS must be used within WSProvider')
  return ctx
}

export function useWSEvent<T extends WSEvent>(type: string, handler: (e: T) => void): void {
  const { subscribe } = useWS()
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    return subscribe(type, (e) => handlerRef.current(e as T))
  }, [type, subscribe])
}
