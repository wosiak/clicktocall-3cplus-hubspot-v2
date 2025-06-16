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
    setCallStatus("COMPLETED") // Reset do status da chamada
    qualificationsRef.current = []
    setPhoneNumber("")
    setIsLoading(false)
  }, [])

  const resetAllState = useCallback(() => {
    setCampaigns([])
    setSelectedCampaign(null)
    setAgentStatus("idle")
    resetCallState()
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
          `https://app.3c.plus/api/v1/agent/login?api_token=${encodeURIComponent(tokenRef.current)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ campaign: campaign.id, mode: "manual" }),
          },
        )

        if (!response.ok) throw new Error(`Login failed: HTTP ${response.status}`)

        setSelectedCampaign(campaign)
        setCampaigns([])
      } catch (error) {
        console.error("❌ Login error:", error)
        updateStatus("Erro ao fazer login. Tente novamente.", "error")
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

      // Criar o payload explicitamente como objeto com string
      const payload = {
        phone: target // Garantir que seja string
      }
      
      console.log("[3C Plus] Payload object:", payload)
      console.log("[3C Plus] Payload JSON:", JSON.stringify(payload))
      
      const response = await fetch(
        `https://app.3c.plus/api/v1/agent/manual_call/dial?api_token=${encodeURIComponent(tokenRef.current)}`,
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
          `https://app.3c.plus/api/v1/agent/manual_call/${activeCall.telephony_id}/qualify?api_token=${encodeURIComponent(tokenRef.current)}`,
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
        updateStatus(`Número ${cleanNum} preenchido pelo HubSpot. Clique em "Discar" para iniciar a chamada.`, "info")
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
          break

        case "call-was-connected":
          const callData: CallData = {
            id: data?.call?.id || "",
            phone: data?.call?.phone || phoneNumber,
            telephony_id: data?.call?.telephony_id || "",
          }
          setActiveCall(callData)
          setAgentStatus("in_call")

          // Notifica o HubSpot que uma chamada está sendo iniciada APENAS AGORA
          // O externalCallId é o telephony_id do 3C Plus
          notifyOutgoingCall(callData.phone, callData.telephony_id)

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

          // The useEffect will handle the transition if call is also finished
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
          // The useEffect will handle the transition if qualification is also complete
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

        case "agent-login-failed":
          setConnectionStatus("disconnected")
          setAgentStatus("idle")
          updateStatus("Login falhou! Cheque microfone + rede, recarregue a página e tente novamente!", "error")
          resetAllState()
          break
        
        case "disconnected":
          setConnectionStatus("disconnected")
          setAgentStatus("idle")
          updateStatus("Desconectado do servidor", "error")
          resetAllState()
          break

        default:
          console.log("🔍 Unhandled socket event:", event, data)
      }
    },
    [campaigns, selectedCampaign, phoneNumber, isCallQualified, activeCall, fetchCampaigns, updateStatus, resetAllState],
  )

  const connectSocket = useCallback(() => {
    if (!tokenRef.current.trim()) {
      updateStatus("Token é obrigatório", "error")
      return
    }

    if (socketRef.current) {
      socketRef.current.removeAllListeners()
      socketRef.current.disconnect()
    }

    setConnectionStatus("connecting")
    updateStatus("Conectando ao servidor...", "loading")

    try {
      const socket = io("https://socket.3c.plus", {
        transports: ["websocket"],
        query: { token: tokenRef.current },
      })

      socketRef.current = socket

      socket.onAny((event, data) => {
        handleSocketEvent(event, data)
      })

      socket.on("connect", () => {
        handleSocketEvent("connected", {})
      })

      socket.on("disconnect", (reason) => {
        handleSocketEvent("disconnected", { reason })
      })

      socket.on("connect_error", (error) => {
        updateStatus("Erro ao conectar. Verifique seu token.", "error")
        setConnectionStatus("disconnected")
      })
    } catch (error) {
      updateStatus("Erro ao criar conexão", "error")
      setConnectionStatus("disconnected")
    }
  }, [handleSocketEvent, updateStatus])

  const openExtension = useCallback(() => {
    if (!tokenRef.current.trim()) {
      updateStatus("Token é obrigatório", "error")
      return
    }

    // Verificar se já existe um iframe da extensão
    const existingIframe = document.getElementById("3c-plus-extension-iframe")
    if (existingIframe) {
      console.log("📱 Iframe da extensão já existe, reutilizando...")
      updateStatus("Extensão já carregada. Aguarde a conexão...", "info")
      return
    }

    // Criar iframe oculto para a extensão
    const iframe = document.createElement("iframe")
    iframe.id = "3c-plus-extension-iframe"
    iframe.src = `https://app.3c.plus/extension?api_token=${encodeURIComponent(tokenRef.current)}`
    iframe.setAttribute("allow", "microphone; autoplay")
    iframe.style.display = "none" // Tornar invisível
    iframe.style.width = "0px"
    iframe.style.height = "0px"
    iframe.style.border = "none"
    iframe.style.position = "absolute"
    iframe.style.top = "-9999px"
    iframe.style.left = "-9999px"
    
    // Adicionar ao body da página
    document.body.appendChild(iframe)
    
    console.log("📱 Iframe da extensão criado e adicionado à página")
    updateStatus("Extensão carregada em segundo plano. Aguarde a conexão...", "info")

    // Cleanup function para remover o iframe quando necessário
    const cleanup = () => {
      const iframeToRemove = document.getElementById("3c-plus-extension-iframe")
      if (iframeToRemove) {
        document.body.removeChild(iframeToRemove)
        console.log("📱 Iframe da extensão removido")
      }
    }

    // Armazenar a função de cleanup para uso posterior
    ;(window as any).cleanup3CPlusExtension = cleanup
  }, [updateStatus])

  const startConnection = useCallback(() => {
    openExtension()
    connectSocket()

    setTimeout(() => {
      if (connectionStatusRef.current === "connected") {
        fetchCampaigns()
      } else {
        updateStatus("Não foi possível conectar à extensão. Verifique o token ou tente novamente.", "error")
      }
    }, 3000)
  }, [openExtension, connectSocket, fetchCampaigns, updateStatus])

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.removeAllListeners()
        socketRef.current.disconnect()
      }
      
      // Cleanup do iframe da extensão quando o componente for desmontado
      const cleanup = (window as any).cleanup3CPlusExtension
      if (cleanup) {
        cleanup()
      }
    }
  }, [])

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case "connected":
        return <Wifi className="h-4 w-4 text-green-500" />
      case "connecting":
        return <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
      default:
        return <WifiOff className="h-4 w-4 text-red-500" />
    }
  }

  const getStatusDescription = () => {
    if (connectionStatus === "disconnected") {
      return ""
    }
    if (connectionStatus === "connecting") {
      return "Conectando..."
    }
    if (connectionStatus === "connected" && campaigns.length > 0) {
      return "Escolha uma campanha para fazer login"
    }
    if (agentStatus === "logged_in") {
      return `Campanha: ${selectedCampaign?.name || "Ativa"}`
    }
    if (agentStatus === "dialing") {
      return "Discando..."
    }
    if (agentStatus === "in_call") {
      return "Ligação conectada - Aguardando atendimento"
    }
    if (agentStatus === "call_answered") {
      if (callFinished && !isCallQualified) {
        return "Ligação finalizada - Selecione uma qualificação"
      }
      return isCallQualified
        ? "Ligação qualificada - Pode encerrar quando quiser"
        : ""
    }
    if (agentStatus === "call_qualified") {
      return `Qualificada: ${selectedQualification?.name || "Sucesso"}`
    }
    return "Aguardando..."
  }

  // Show qualification buttons when:
  // 1. Call is answered AND not qualified yet
  // 2. OR call is finished but not qualified yet
  const showQualificationButtons =
    activeCall !== null &&
    !isCallQualified &&
    qualifications.length > 0 &&
    (agentStatus === "call_answered" || (callFinished && agentStatus === "call_answered"))

  // Show hangup button when:
  // 1. There's an active call
  // 2. AND call is not finished yet
  // 3. AND we're in an active call state
  const showHangupButton =
    activeCall !== null &&
    !callFinished &&
    (agentStatus === "in_call" || agentStatus === "call_answered" || agentStatus === "call_qualified")

  // Show call info when there's an active call in any call-related state
  const showCallInfo =
    activeCall !== null &&
    (agentStatus === "in_call" || agentStatus === "call_answered" || agentStatus === "call_qualified")

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          3C Plus | Click-to-Call
          {getConnectionIcon()}
        </CardTitle>
        <CardDescription>{getStatusDescription()}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {status.message && (
          <Alert variant={status.type === "error" ? "destructive" : "default"}>
            {status.type === "success" && <CheckCircle className="h-4 w-4" />}
            {status.type === "error" && <AlertCircle className="h-4 w-4" />}
            {status.type === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
            <AlertDescription>{status.message}</AlertDescription>
          </Alert>
        )}

        {connectionStatus === "disconnected" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token">Token de Operador</Label>
              <Input
                id="token"
                type="password"
                placeholder="Insira seu token de operador"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <Button onClick={startConnection} disabled={!token.trim() || isLoading} className="w-full">
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Conectar
            </Button>
          </div>
        )}

        {connectionStatus === "connected" && campaigns.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Campanhas Disponíveis</h3>
            <div className="grid gap-2">
              {campaigns.map((campaign) => (
                <Button
                  key={campaign.id}
                  variant="outline"
                  onClick={() => loginToCampaign(campaign)}
                  disabled={isLoading}
                  className="justify-start"
                >
                  {campaign.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        {agentStatus === "logged_in" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Digite o número desejado:</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="Ex: 5511999998888"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <Button onClick={() => makeCall()} disabled={!phoneNumber.trim() || isLoading} className="w-full">
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Phone className="mr-2 h-4 w-4" />}
              Discar
            </Button>
          </div>
        )}

        {showCallInfo && (
          <div className="space-y-4 p-4 bg-blue-50 rounded-lg">
            <h3 className="text-lg font-semibold">Ligação Ativa</h3>
            <div className="space-y-2">
              <p><strong>Número:</strong> {activeCall?.phone}</p>
              <p><strong>ID:</strong> {activeCall?.id}</p>
              <p><strong>Telephony ID (HubSpot External Call ID):</strong> {activeCall?.telephony_id}</p>
              {selectedQualification && (
                <p><strong>Qualificação:</strong> {selectedQualification.name}</p>
              )}
            </div>
          </div>
        )}

        {showQualificationButtons && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Qualificar Ligação</h3>
            <div className="grid gap-2">
              {qualifications.map((qualification) => (
                <Button
                  key={qualification.id}
                  variant={selectedQualification?.id === qualification.id ? "default" : "outline"}
                  onClick={() => qualifyCall(qualification)}
                  disabled={isLoading || selectedQualification?.id === qualification.id}
                  className="justify-start"
                >
                  {qualification.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        {showHangupButton && (
          <Button variant="destructive" onClick={hangupCall} disabled={isLoading} className="w-full">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Encerrar Ligação
          </Button>
        )}
      </CardContent>
    </Card>
  )
}