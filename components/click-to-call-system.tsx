"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { AlertCircle, CheckCircle, Phone, Loader2, Wifi, WifiOff } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { io, type Socket } from "socket.io-client"
import { 
  initHubspotCallProvider, 
  notifyOutgoingCall, 
  notifyCallAnswered, 
  notifyCallEnded, 
  notifyCallCompleted,
  notifyUserLoggedIn,
  notifyUserAvailable,
  notifyUserUnavailable,
  notifyUserLoggedOut,
  sendError,
  type CallData as HubSpotCallData
} from "@/lib/hubspot-call-provider"

// Types
interface Campaign {
  id: number
  name: string
}

interface Qualification {
  id: number
  name: string
}

interface CallData {
  id: string
  phone: string
  telephony_id: string
}

type ConnectionStatus = "disconnected" | "connecting" | "connected"
type AgentStatus = "idle" | "logged_in" | "dialing" | "in_call" | "call_answered" | "call_qualified"

interface StatusMessage {
  message: string
  type: "success" | "error" | "info" | "loading"
}

export default function ClickToCallSystem() {
  const [token, setToken] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected")
  const [agentStatus, setAgentStatus] = useState<AgentStatus>("idle")
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [activeCall, setActiveCall] = useState<CallData | null>(null)
  const [qualifications, setQualifications] = useState<Qualification[]>([])
  const [selectedQualification, setSelectedQualification] = useState<Qualification | null>(null)
  const [status, setStatus] = useState<StatusMessage>({ message: "Insira um Token de Operador para começar", type: "info" })
  const [isLoading, setIsLoading] = useState(false)

  // Track call completion states
  const [isCallQualified, setIsCallQualified] = useState(false)
  const [callFinished, setCallFinished] = useState(false)
  const [callStatus, setCallStatus] = useState<string>("COMPLETED")

  const socketRef = useRef<Socket | null>(null)
  const tokenRef = useRef<string>("")
  const connectionStatusRef = useRef<ConnectionStatus>("disconnected")
  const qualificationsRef = useRef<Qualification[]>([])

  useEffect(() => {
    tokenRef.current = token
  }, [token])

  useEffect(() => {
    connectionStatusRef.current = connectionStatus
  }, [connectionStatus])

  const updateStatus = useCallback((message: string, type: StatusMessage["type"] = "info") => {
    setStatus({ message, type })
  }, [])

  const resetCallState = useCallback(() => {
    console.log("🧹 Resetting call state completely")
    setActiveCall(null)
    setQualifications([])
    setSelectedQualification(null)
    setIsCallQualified(false)
    setCallFinished(false)
    setCallStatus("COMPLETED")
    qualificationsRef.current = []
    setPhoneNumber("")
    setIsLoading(false)
  }, [])

  const resetAllState = useCallback(() => {
    setCampaigns([])
    setSelectedCampaign(null)
    setAgentStatus("idle")
    resetCallState()
    // CORREÇÃO: Notificar HubSpot que usuário fez logout
    notifyUserLoggedOut()
  }, [resetCallState])

  // Watch for both conditions to be met and automatically transition to dial
  useEffect(() => {
    if (isCallQualified && callFinished && activeCall) {
      console.log("✅ Both qualification and call finished - transitioning to dial")

      // Notifica o HubSpot que a chamada foi completada
      const engagementData = selectedQualification ? {
        notes: `Chamada qualificada como: ${selectedQualification.name}`,
        subject: `Chamada - ${activeCall.phone}`,
        qualification: selectedQualification
      } : undefined
      
      notifyCallCompleted(activeCall, engagementData, callStatus)

      // Show completion message
      updateStatus(`Ligação finalizada: ${activeCall.phone}. Pronto para nova ligação.`, "success")

      // Reset to logged_in state (dial screen)
      setAgentStatus("logged_in")

      // Reset call state after a brief delay to show the completion message
      setTimeout(() => {
        resetCallState()
        updateStatus(`Pronto para nova ligação. Campanha: ${selectedCampaign?.name || "Ativa"}`, "success")
      }, 1500)
    }
  }, [isCallQualified, callFinished, activeCall, selectedCampaign, selectedQualification, updateStatus, resetCallState, callStatus])

  const fetchCampaigns = useCallback(async () => {
    if (!tokenRef.current || connectionStatusRef.current !== "connected") {
      console.log("❌ Cannot fetch campaigns - no token or not connected")
      return
    }

    try {
      setIsLoading(true)
      updateStatus("Buscando campanhas...", "loading")

      const response = await fetch(
        `https://app.3c.plus/api/v1/groups-and-campaigns?all=true&paused=0&api_token=${tokenRef.current}`,
       )

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const data = await response.json()
      const campaignList = data?.data?.filter((c: any) => c.type === "campaign") || []

      setCampaigns(campaignList)
      updateStatus(`${campaignList.length} campanhas encontradas. Escolha uma para fazer login.`, "success")
    } catch (error) {
      console.error("❌ Error fetching campaigns:", error)
      updateStatus("Erro ao buscar campanhas. Verifique seu token.", "error")
      // CORREÇÃO: Enviar erro para HubSpot
      sendError({
        message: "Erro ao buscar campanhas",
        error: error instanceof Error ? error.message : "Unknown error"
      })
    } finally {
      setIsLoading(false)
    }
  }, [updateStatus])

  const loginToCampaign = useCallback(
    async (campaign: Campaign) => {
      if (!tokenRef.current || agentStatus !== "idle") {
        updateStatus("Não é possível fazer login agora", "error")
        return
      }

      try {
        setIsLoading(true)
        updateStatus("Fazendo login na campanha...", "loading")

        const response = await fetch(
          `https://app.3c.plus/api/v1/agent/login?api_token=${encodeURIComponent(tokenRef.current )}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ campaign: campaign.id, mode: "manual" }),
          },
        )

        if (!response.ok) throw new Error(`Login failed: HTTP ${response.status}`)

        setSelectedCampaign(campaign)
        setCampaigns([])
        
        // CORREÇÃO: Notificar HubSpot que usuário fez login
        notifyUserLoggedIn()
        
      } catch (error) {
        console.error("❌ Login error:", error)
        updateStatus("Erro ao fazer login. Tente novamente.", "error")
        // CORREÇÃO: Enviar erro para HubSpot
        sendError({
          message: "Erro ao fazer login na campanha",
          error: error instanceof Error ? error.message : "Unknown error"
        })
      } finally {
        setIsLoading(false)
      }
    },
    [agentStatus, updateStatus],
  )

  const makeCall = useCallback(async (number?: string) => {
    // Se number for um objeto (evento de clique), ignorar e usar phoneNumber
    let target = ""
    if (typeof number === "string" && number.trim()) {
      target = number.trim()
    } else {
      target = String(phoneNumber || "").trim()
    }
    
    console.log("[3C Plus] makeCall - number param:", number, typeof number)
    console.log("[3C Plus] makeCall - phoneNumber state:", phoneNumber, typeof phoneNumber)
    console.log("[3C Plus] makeCall - target final:", target, typeof target)
    
    if (!target || agentStatus !== "logged_in") {
      updateStatus("Insira um número válido", "error")
      return
    }

    try {
      setIsLoading(true)
      setAgentStatus("dialing")
      updateStatus("Iniciando chamada...", "loading")
      
      // CORREÇÃO: Notificar HubSpot que usuário está disponível antes de discar
      notifyUserAvailable()

      // Criar o payload explicitamente como objeto com string
      const payload = {
        phone: target // Garantir que seja string
      }
      
      console.log("[3C Plus] Payload object:", payload)
      console.log("[3C Plus] Payload JSON:", JSON.stringify(payload))
      
      const response = await fetch(
        `https://app.3c.plus/api/v1/agent/manual_call/dial?api_token=${encodeURIComponent(tokenRef.current )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      )

      if (!response.ok) throw new Error(`Dial failed: HTTP ${response.status}`)
      
      updateStatus(`Discando para ${target}...`, "info")
    } catch (error) {
      console.error("❌ Call error:", error)
      updateStatus("Erro ao iniciar chamada", "error")
      setAgentStatus("logged_in")
      // CORREÇÃO: Enviar erro para HubSpot
      sendError({
        message: "Erro ao iniciar chamada",
        error: error instanceof Error ? error.message : "Unknown error"
      })
    } finally {
      setIsLoading(false)
    }
  }, [phoneNumber, agentStatus, updateStatus])

  const qualifyCall = useCallback(
    async (qualification: Qualification) => {
      if (!activeCall?.telephony_id) {
        updateStatus("Não há ligação ativa para qualificar", "error")
        return
      }

      try {
        setIsLoading(true)
        updateStatus("Qualificando chamada...", "loading")

        const response = await fetch(
          `https://app.3c.plus/api/v1/agent/manual_call/${activeCall.telephony_id}/qualify?api_token=${encodeURIComponent(tokenRef.current )}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ qualification_id: String(qualification.id) }),
          },
        )

        if (!response.ok) throw new Error(`Qualification failed: HTTP ${response.status}`)

        // Set selected qualification immediately for UI feedback
        setSelectedQualification(qualification)
        updateStatus(`Qualificação usada: ${qualification.name}`, "success")
      } catch (error) {
        console.error("❌ Qualification error:", error)
        updateStatus("Erro ao qualificar chamada", "error")
        setIsLoading(false)
        // CORREÇÃO: Enviar erro para HubSpot
        sendError({
          message: "Erro ao qualificar chamada",
          error: error instanceof Error ? error.message : "Unknown error"
        })
      }
    },
    [activeCall, updateStatus],
  )

  const hangupCall = useCallback(async () => {
    if (!activeCall?.id) return

    try {
      setIsLoading(true)
      updateStatus("Encerrando chamada...", "loading")

      // Notifica o HubSpot que a chamada está sendo encerrada
      notifyCallEnded(activeCall)

      const response = await fetch(
        `https://app.3c.plus/api/v1/agent/call/${activeCall.id}/hangup?api_token=${tokenRef.current}`,
        {
          method: "POST",
        },
       )

      if (!response.ok) throw new Error(`Hangup failed: HTTP ${response.status}`)
    } catch (error) {
      console.error("❌ Hangup error:", error)
      updateStatus("Erro ao encerrar chamada", "error")
      setIsLoading(false)
      // CORREÇÃO: Enviar erro para HubSpot
      sendError({
        message: "Erro ao encerrar chamada",
        error: error instanceof Error ? error.message : "Unknown error"
      })
    }
  }, [activeCall, updateStatus])

  // Initialize HubSpot calling bridge
  useEffect(() => {
    initHubspotCallProvider({
      dial: (num: string) => makeCall(num),
      hangup: hangupCall,
      qualify: (qId: string) => {
        qualifyCall({ id: Number(qId), name: qId })
      },
      fillPhoneNumber: (num: string) => {
        console.log("[3C Plus] fillPhoneNumber recebido:", num, typeof num)
        const cleanNum = String(num).trim()
        console.log("[3C Plus] fillPhoneNumber limpo:", cleanNum, typeof cleanNum)
        setPhoneNumber(cleanNum)
        updateStatus(`Número ${cleanNum} preenchido pelo HubSpot. Clique em \"Discar\" para iniciar a chamada.`, "info")
      },
    })
  }, [makeCall, hangupCall, qualifyCall, updateStatus])

  const handleSocketEvent = useCallback(
    (event: string, data: any) => {
      console.log("📡 Socket event received:", event, data)

      switch (event) {
        case "connected":
          setConnectionStatus("connected")
          updateStatus("Extensão conectada! Buscando campanhas...", "success")
          fetchCampaigns()
          break

        case "agent-entered-manual":
          setAgentStatus("logged_in")
          const campaignId = data?.campaign_id
          const campaign = campaigns.find((c) => c.id === campaignId) || selectedCampaign
          updateStatus(
            campaign ? `Login realizado! Campanha: ${campaign.name}` : "Login realizado! Pronto para discar.",
            "success",
          )
          // CORREÇÃO: Notificar HubSpot que usuário está disponível após login
          notifyUserAvailable()
          break

        case "call-was-connected":
          const callData: CallData = {
            id: data?.call?.id || "",
            phone: data?.call?.phone || phoneNumber,
            telephony_id: data?.call?.telephony_id || "",
          }
          setActiveCall(callData)
          setAgentStatus("in_call")

          // CORREÇÃO: Notifica o HubSpot que uma chamada está sendo iniciada
          // Usar o número original do 3C Plus, mas garantir formato internacional
          let formattedPhone = callData.phone
          if (!formattedPhone.startsWith("+")) {
            formattedPhone = "+55" + callData.phone
          }
          
          notifyOutgoingCall(formattedPhone, callData.telephony_id)

          // Reset call completion states for new call
          setIsCallQualified(false)
          setCallFinished(false)
          setSelectedQualification(null)

          // Store qualifications for when call is answered
          const quals = data?.campaign?.dialer?.qualification_list?.qualifications || []
          qualificationsRef.current = quals.map((q: any) => ({ id: q.id, name: q.name }))
          updateStatus(`Ligação conectada: ${callData.phone}`, "success")
          break

        case "manual-call-was-answered":
          setAgentStatus("call_answered")
          setQualifications(qualificationsRef.current)
          updateStatus("Ligação atendida! Qualifique quando necessário.", "info")
          
          // Notifica o HubSpot que a chamada foi atendida
          if (activeCall) {
            notifyCallAnswered(activeCall)
          }
          break

        case "manual-call-was-qualified":
          console.log("📞 Call was qualified")
          const qualificationUsed = data?.qualification || data?.call?.qualification

          if (qualificationUsed) {
            setSelectedQualification({ id: qualificationUsed.id, name: qualificationUsed.name })
            updateStatus(``, "success")
          } else {
            updateStatus("Ligação qualificada com sucesso!", "success")
          }

          setIsCallQualified(true)
          setAgentStatus("call_qualified")
          setIsLoading(false) // Stop loading state
          break

        case "call-was-finished":
          console.log("📞 Call was finished")
          setCallFinished(true)
          setCallStatus("COMPLETED")

          if (!isCallQualified) {
            // Call ended but not qualified yet - show qualification options
            updateStatus("Ligação finalizada. Selecione uma qualificação.", "info")
            setAgentStatus("call_answered")
            setQualifications(qualificationsRef.current)
          } else {
            // Call ended and already qualified - useEffect will handle transition
            updateStatus("Ligação finalizada.", "info")
          }

          setIsLoading(false) // Stop any loading states
          break

        case "call-was-not-answered":
          updateStatus("Ligação não foi atendida pelo cliente. Selecione uma qualificação.", "info")
          
          // Notifica o HubSpot que a chamada foi finalizada (não atendida)
          if (activeCall) {
            notifyCallEnded(activeCall)
          }
          
          // Definir como call_answered para mostrar as qualificações
          setAgentStatus("call_answered")
          setQualifications(qualificationsRef.current)
          setCallFinished(true) // Marcar como finalizada para não mostrar botão de hangup
          setIsCallQualified(false) // Ainda não foi qualificada
          setCallStatus("NO_ANSWER")
          break

        case "call-was-failed":
          updateStatus("Ligação falhou!", "info")
          
          // Notifica o HubSpot que a chamada foi finalizada (falhou)
          if (activeCall) {
            notifyCallEnded(activeCall)
          }
          
          // Definindo como call_answered para mostrar as qualificações
          setAgentStatus("call_answered")
          setQualifications(qualificationsRef.current)
          setCallFinished(true) // Marcar como finalizada para não mostrar botão de hangup
          setIsCallQualified(false) // Ainda não foi qualificada
          setCallStatus("FAILED")
          break

        case "call-was-busy":
          updateStatus("Linha ocupada!", "info")
          
          // Notifica o HubSpot que a chamada foi finalizada (ocupada)
          if (activeCall) {
            notifyCallEnded(activeCall)
          }
          
          // Definindo como call_answered para mostrar as qualificações
          setAgentStatus("call_answered")
          setQualifications(qualificationsRef.current)
          setCallFinished(true) // Marcar como finalizada para não mostrar botão de hangup
          setIsCallQualified(false) // Ainda não foi qualificada
          setCallStatus("BUSY")
          break

        case "agent-left-manual":
          updateStatus("Saiu do modo manual", "info")
          setAgentStatus("idle")
          resetAllState()
          break

        case "disconnected":
          setConnectionStatus("disconnected")
          updateStatus("Extensão desconectada", "error")
          resetAllState()
          break

        default:
          console.log("📡 Unhandled socket event:", event, data)
      }
    },
    [
      updateStatus,
      fetchCampaigns,
      campaigns,
      selectedCampaign,
      phoneNumber,
      activeCall,
      isCallQualified,
      resetAllState,
    ],
  )

  // Socket connection management
  useEffect(() => {
    if (!token) return

    const connectSocket = () => {
      if (socketRef.current?.connected) return

      setConnectionStatus("connecting")
      updateStatus("Conectando extensão...", "loading")

      const socket = io("wss://app.3c.plus", {
        auth: { token },
        transports: ["websocket"],
      })

      socket.on("connect", () => handleSocketEvent("connected", {}))
      socket.on("disconnect", () => handleSocketEvent("disconnected", {}))
      socket.on("agent-entered-manual", (data) => handleSocketEvent("agent-entered-manual", data))
      socket.on("call-was-connected", (data) => handleSocketEvent("call-was-connected", data))
      socket.on("manual-call-was-answered", (data) => handleSocketEvent("manual-call-was-answered", data))
      socket.on("manual-call-was-qualified", (data) => handleSocketEvent("manual-call-was-qualified", data))
      socket.on("call-was-finished", (data) => handleSocketEvent("call-was-finished", data))
      socket.on("call-was-not-answered", (data) => handleSocketEvent("call-was-not-answered", data))
      socket.on("call-was-failed", (data) => handleSocketEvent("call-was-failed", data))
      socket.on("call-was-busy", (data) => handleSocketEvent("call-was-busy", data))
      socket.on("agent-left-manual", (data) => handleSocketEvent("agent-left-manual", data))

      socketRef.current = socket
    }

    connectSocket()

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [token, handleSocketEvent, updateStatus])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // CORREÇÃO: Notificar HubSpot que usuário não está mais disponível
      notifyUserUnavailable()
      notifyUserLoggedOut()
    }
  }, [])

  const renderStatusIcon = () => {
    switch (status.type) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />
      case "loading":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-blue-500" />
    }
  }

  const renderConnectionStatus = () => {
    switch (connectionStatus) {
      case "connected":
        return <Wifi className="h-4 w-4 text-green-500" />
      case "connecting":
        return <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
      default:
        return <WifiOff className="h-4 w-4 text-red-500" />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-md space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Click-to-Call 3C Plus
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              {renderConnectionStatus()}
              Status: {connectionStatus}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status Alert */}
            <Alert>
              <div className="flex items-center gap-2">
                {renderStatusIcon()}
                <AlertDescription>{status.message}</AlertDescription>
              </div>
            </Alert>

            {/* Token Input */}
            {agentStatus === "idle" && (
              <div className="space-y-2">
                <Label htmlFor="token">Token de Operador</Label>
                <Input
                  id="token"
                  type="password"
                  placeholder="Insira seu token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            )}

            {/* Campaign Selection */}
            {campaigns.length > 0 && (
              <div className="space-y-2">
                <Label>Campanhas Disponíveis</Label>
                <div className="space-y-2">
                  {campaigns.map((campaign) => (
                    <Button
                      key={campaign.id}
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => loginToCampaign(campaign)}
                      disabled={isLoading}
                    >
                      {campaign.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Phone Number Input and Dial */}
            {agentStatus === "logged_in" && (
              <div className="space-y-2">
                <Label htmlFor="phone">Número de Telefone</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="Ex: 11999999999"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={isLoading}
                />
                <Button
                  onClick={() => makeCall()}
                  disabled={!phoneNumber || isLoading}
                  className="w-full"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Phone className="h-4 w-4 mr-2" />}
                  Discar
                </Button>
              </div>
            )}

            {/* Active Call Controls */}
            {(agentStatus === "dialing" || agentStatus === "in_call") && activeCall && (
              <div className="space-y-2">
                <div className="text-center">
                  <p className="font-medium">Ligação Ativa</p>
                  <p className="text-sm text-gray-600">{activeCall.phone}</p>
                </div>
                {!callFinished && (
                  <Button
                    onClick={hangupCall}
                    variant="destructive"
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Encerrar Chamada
                  </Button>
                )}
              </div>
            )}

            {/* Qualification Selection */}
            {(agentStatus === "call_answered" || agentStatus === "call_qualified") && qualifications.length > 0 && (
              <div className="space-y-2">
                <Label>Qualificação da Chamada</Label>
                <div className="space-y-2">
                  {qualifications.map((qualification) => (
                    <Button
                      key={qualification.id}
                      variant={selectedQualification?.id === qualification.id ? "default" : "outline"}
                      className="w-full justify-start"
                      onClick={() => qualifyCall(qualification)}
                      disabled={isLoading || selectedQualification?.id === qualification.id}
                    >
                      {qualification.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
