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
  serverUrl = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000' 
}: UseSocketBroadcastProps) {
  const socketRef = useRef<Socket | null>(null)
  const isConnectedRef = useRef<boolean>(false)

  const connectSocket = useCallback(() => {
    if (!token || socketRef.current?.connected) return

    console.log("🔌 Connecting to Socket.IO server...")
    
    const socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
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

    // Event handlers
    socket.on('extension-opened', (data) => {
      console.log("📱 Extension opened:", data)
      handlers.onExtensionOpened?.(data)
    })

    socket.on('extension-connected', (data) => {
      console.log("✅ Extension connected:", data)
      handlers.onExtensionConnected?.(data)
    })

    socket.on('extension-closed', (data) => {
      console.log("❌ Extension closed:", data)
      handlers.onExtensionClosed?.(data)
    })

    socket.on('agent-connected', (data) => {
      console.log("🔗 Agent connected:", data)
      handlers.onAgentConnected?.(data)
    })

    socket.on('agent-logged-out', (data) => {
      console.log("🚪 Agent logged out:", data)
      handlers.onAgentLoggedOut?.(data)
    })

    socket.on('agent-logged-out-during-call', (data) => {
      console.log("🚪 Agent logged out during call:", data)
      handlers.onAgentLoggedOutDuringCall?.(data)
    })

    socket.on('campaigns-loaded', (data) => {
      console.log("📋 Campaigns loaded:", data)
      handlers.onCampaignsLoaded?.(data)
    })

    socket.on('microphone-muted', (data) => {
      console.log("🔇 Microphone muted:", data)
      handlers.onMicrophoneMuted?.(data)
    })

    socket.on('microphone-unmuted', (data) => {
      console.log("🎤 Microphone unmuted:", data)
      handlers.onMicrophoneUnmuted?.(data)
    })

    socket.on('heartbeat', (data) => {
      handlers.onHeartbeat?.(data)
    })

    socket.on('token-validation', (data) => {
      console.log("🔐 Token validation:", data)
      handlers.onTokenValidation?.(data)
    })

    socket.on('check-extension-status', (data) => {
      console.log("🔍 Check extension status:", data)
      handlers.onCheckExtensionStatus?.(data)
    })

    socket.on('extension-status-response', (data) => {
      console.log("📊 Extension status response:", data)
      handlers.onExtensionStatusResponse?.(data)
    })

    socket.on('error', (error) => {
      console.error("🚨 Socket.IO error:", error)
    })

  }, [token, serverUrl, handlers])

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
    } else {
      disconnectSocket()
    }

    return () => {
      disconnectSocket()
    }
  }, [token, connectSocket, disconnectSocket])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectSocket()
    }
  }, [disconnectSocket])

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
