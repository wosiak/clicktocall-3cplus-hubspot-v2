"use client"

import { useEffect, useRef, useCallback } from "react"
import { io, type Socket } from "socket.io-client"

interface SocketBroadcastHandlers {
  onExtensionOpened?: (data: any) => void
  onExtensionConnected?: (data: any) => void
  onExtensionClosed?: (data: any) => void
  onAgentConnected?: (data: any) => void
  onAgentLoggedOut?: (data: any) => void
  onAgentLoggedOutDuringCall?: (data: any) => void
  onCampaignsLoaded?: (data: any) => void
  onMicrophoneMuted?: (data: any) => void
  onMicrophoneUnmuted?: (data: any) => void
  onHeartbeat?: (data: any) => void
  onTokenValidation?: (data: any) => void
  onCheckExtensionStatus?: (data: any) => void
  onExtensionStatusResponse?: (data: any) => void
}

interface UseSocketBroadcastProps {
  token: string
  handlers: SocketBroadcastHandlers
  serverUrl?: string
}

export function useSocketBroadcast({ 
  token, 
  handlers, 
  serverUrl = process.env.NODE_ENV === 'production' ? '' : 'https://localhost' 
}: UseSocketBroadcastProps) {
  const socketRef = useRef<Socket | null>(null)
  const isConnectedRef = useRef<boolean>(false)
  const handlersRef = useRef(handlers)

  // Update handlers ref when handlers change
  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])

  const connectSocket = useCallback(() => {
    if (!token) return
    
    // Se já tem socket conectado, não criar outro
    if (socketRef.current?.connected) {
      console.log("🔌 Socket.IO já conectado, reutilizando...")
      return
    }
    
    // Se tem socket desconectado, limpar primeiro
    if (socketRef.current) {
      console.log("🧹 Limpando socket anterior...")
      socketRef.current.disconnect()
      socketRef.current = null
    }

    console.log("🔌 Conectando ao Socket.IO server...")
    
    const socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: false, // DESABILITAR auto-reconnection
      timeout: 20000,
      secure: true,
      rejectUnauthorized: false,
    })

    socketRef.current = socket

    // Connection events
    socket.on('connect', () => {
      console.log("✅ Socket.IO connected")
      isConnectedRef.current = true
      
      // Join room with token
      socket.emit('join-room', { token })
    })

    socket.on('disconnect', () => {
      console.log("❌ Socket.IO disconnected")
      isConnectedRef.current = false
    })

    socket.on('joined-room', (data) => {
      console.log("📱 Joined room:", data)
    })

    // Event handlers - usando handlersRef.current para evitar closures
    socket.on('extension-opened', (data) => {
      console.log("📱 Extension opened:", data)
      handlersRef.current.onExtensionOpened?.(data)
    })

    socket.on('extension-connected', (data) => {
      console.log("✅ Extension connected:", data)
      handlersRef.current.onExtensionConnected?.(data)
    })

    socket.on('extension-closed', (data) => {
      console.log("❌ Extension closed:", data)
      handlersRef.current.onExtensionClosed?.(data)
    })

    socket.on('agent-connected', (data) => {
      console.log("🔗 Agent connected:", data)
      handlersRef.current.onAgentConnected?.(data)
    })

    socket.on('agent-logged-out', (data) => {
      console.log("🚪 Agent logged out:", data)
      handlersRef.current.onAgentLoggedOut?.(data)
    })

    socket.on('agent-logged-out-during-call', (data) => {
      console.log("🚪 Agent logged out during call:", data)
      handlersRef.current.onAgentLoggedOutDuringCall?.(data)
    })

    socket.on('campaigns-loaded', (data) => {
      console.log("📋 Campaigns loaded:", data)
      handlersRef.current.onCampaignsLoaded?.(data)
    })

    socket.on('microphone-muted', (data) => {
      console.log("🔇 Microphone muted:", data)
      handlersRef.current.onMicrophoneMuted?.(data)
    })

    socket.on('microphone-unmuted', (data) => {
      console.log("🎤 Microphone unmuted:", data)
      handlersRef.current.onMicrophoneUnmuted?.(data)
    })

    socket.on('heartbeat', (data) => {
      handlersRef.current.onHeartbeat?.(data)
    })

    socket.on('token-validation', (data) => {
      console.log("🔐 Token validation:", data)
      handlersRef.current.onTokenValidation?.(data)
    })

    socket.on('check-extension-status', (data) => {
      console.log("🔍 Check extension status:", data)
      handlersRef.current.onCheckExtensionStatus?.(data)
    })

    socket.on('extension-status-response', (data) => {
      console.log("📊 Extension status response:", data)
      handlersRef.current.onExtensionStatusResponse?.(data)
    })

    socket.on('error', (error) => {
      console.error("🚨 Socket.IO error:", error)
    })

  }, [token, serverUrl])

  const disconnectSocket = useCallback(() => {
    if (socketRef.current) {
      console.log("🔌 Disconnecting Socket.IO...")
      socketRef.current.disconnect()
      socketRef.current = null
      isConnectedRef.current = false
    }
  }, [])

  // Broadcast methods
  const broadcastExtensionOpened = useCallback((data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('extension-opened', { token, ...data })
    }
  }, [token])

  const broadcastExtensionConnected = useCallback((data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('extension-connected', { token, ...data })
    }
  }, [token])

  const broadcastExtensionClosed = useCallback((data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('extension-closed', { token, ...data })
    }
  }, [token])

  const broadcastAgentConnected = useCallback((data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('agent-connected', { token, ...data })
    }
  }, [token])

  const broadcastAgentLoggedOut = useCallback((data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('agent-logged-out', { token, ...data })
    }
  }, [token])

  const broadcastAgentLoggedOutDuringCall = useCallback((data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('agent-logged-out-during-call', { token, ...data })
    }
  }, [token])

  const broadcastCampaignsLoaded = useCallback((campaigns: any[]) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('campaigns-loaded', { token, campaigns })
    }
  }, [token])

  const broadcastMicrophoneMuted = useCallback((data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('microphone-muted', { token, ...data })
    }
  }, [token])

  const broadcastMicrophoneUnmuted = useCallback((data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('microphone-unmuted', { token, ...data })
    }
  }, [token])

  const sendHeartbeat = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('heartbeat', { token, timestamp: Date.now() })
    }
  }, [token])

  const sendTokenValidation = useCallback((validationToken: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('token-validation', { token, validationToken })
    }
  }, [token])

  const checkExtensionStatus = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('check-extension-status', { token })
    }
  }, [token])

  const respondExtensionStatus = useCallback((data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('extension-status-response', { token, ...data })
    }
  }, [token])

  // Auto-connect when token changes
  useEffect(() => {
    if (token) {
      connectSocket()
    } else if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
      isConnectedRef.current = false
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
        isConnectedRef.current = false
      }
    }
  }, [token])

  return {
    isConnected: isConnectedRef.current,
    socket: socketRef.current,
    // Broadcast methods
    broadcastExtensionOpened,
    broadcastExtensionConnected,
    broadcastExtensionClosed,
    broadcastAgentConnected,
    broadcastAgentLoggedOut,
    broadcastAgentLoggedOutDuringCall,
    broadcastCampaignsLoaded,
    broadcastMicrophoneMuted,
    broadcastMicrophoneUnmuted,
    sendHeartbeat,
    sendTokenValidation,
    checkExtensionStatus,
    respondExtensionStatus,
  }
}
