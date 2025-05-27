"use client"

import { useEffect, useRef, useCallback } from "react"
import { io, type Socket } from "socket.io-client"

interface UseCallSocketProps {
  agentToken: string
  onEvent: (event: string, payload: any) => void
}

export function useCallSocket({ agentToken, onEvent }: UseCallSocketProps) {
  const socketRef = useRef<Socket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (socketRef.current) {
      socketRef.current.removeAllListeners()
      socketRef.current.disconnect()
      socketRef.current = null
    }
  }, [])

  const connectSocket = useCallback(() => {
    if (!agentToken) {
      cleanup()
      return
    }

    // Clean up existing connection
    cleanup()

    console.log("🔌 Attempting to connect to 3C Plus socket...")

    try {
      // Create socket connection with better configuration
      const socket = io("https://app.3c.plus", {
        transports: ["polling", "websocket"], // Try polling first, then websocket
        upgrade: true,
        rememberUpgrade: true,
        timeout: 20000,
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        query: {
          api_token: agentToken,
        },
        extraHeaders: {
          "Access-Control-Allow-Origin": "*",
        },
      })

      socketRef.current = socket

      // Connection event handlers
      socket.on("connect", () => {
        console.log("✅ Socket connected successfully")
        onEvent("connected", { transport: socket.io.engine.transport.name })
      })

      socket.on("disconnect", (reason) => {
        console.log("❌ Socket disconnected:", reason)
        onEvent("disconnected", { reason })
      })

      socket.on("connect_error", (error) => {
        console.error("🚨 Socket connection error:", error)
        onEvent("disconnected", { error: error.message })

        // Try to reconnect after a delay
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
        }

        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("🔄 Attempting to reconnect...")
          connectSocket()
        }, 3000)
      })

      socket.on("reconnect", (attemptNumber) => {
        console.log("🔄 Socket reconnected after", attemptNumber, "attempts")
        onEvent("connected", { reconnected: true })
      })

      socket.on("reconnect_error", (error) => {
        console.error("🚨 Socket reconnection error:", error)
      })

      socket.on("reconnect_failed", () => {
        console.error("💥 Socket reconnection failed")
        onEvent("disconnected", { error: "Reconnection failed" })
      })

      // 3C Plus specific events
      const events = [
        "agent-entered-manual",
        "call-was-connected",
        "manual-call-was-answered",
        "manual-call-was-qualified",
        "call-ended",
      ]

      events.forEach((event) => {
        socket.on(event, (payload) => {
          console.log(`📡 Received event: ${event}`, payload)
          onEvent(event, payload)
        })
      })

      // Handle transport upgrade
      socket.io.on("upgrade", () => {
        console.log("⬆️ Transport upgraded to:", socket.io.engine.transport.name)
      })
    } catch (error) {
      console.error("💥 Failed to create socket connection:", error)
      onEvent("disconnected", { error: "Failed to create connection" })
    }
  }, [agentToken, onEvent, cleanup])

  useEffect(() => {
    connectSocket()
    return cleanup
  }, [connectSocket, cleanup])

  return socketRef.current
}
