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
  notifyUserLoggedOut,
  notifyUserAvailable,
  sendError,
  translateCallStatus,
  type CallData as HubSpotCallData
} from "@/lib/hubspot-call-provider"
import { disconnect } from "process"

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
  recordingLink?: string
  qualificationName?: string
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
  const [callSid, setCallSid] = useState<string>(''); /* Adicionado agora para guardar o Protocolo da Chamada*/
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected")
  const [agentStatus, setAgentStatus] = useState<AgentStatus>("idle")
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [activeCall, setActiveCall] = useState<CallData | null>(null)
  const [qualifications, setQualifications] = useState<Qualification[]>([])
  const [selectedQualification, setSelectedQualification] = useState<Qualification | null>(null)
  const [status, setStatus] = useState<StatusMessage>({ message: "Inicializando...", type: "loading" })
  const [isLoading, setIsLoading] = useState(false)

  // Track call completion states
  const [isCallQualified, setIsCallQualified] = useState(false)
  const [callFinished, setCallFinished] = useState(false)
  const [callStatus, setCallStatus] = useState<string>("COMPLETED")

  // NOVO: Ref para armazenar dados da chamada de forma mais robusta
  const callDataRef = useRef<CallData | null>(null)

  const socketRef = useRef<Socket | null>(null)
  const tokenRef = useRef<string>("")
  const connectionStatusRef = useRef<ConnectionStatus>("disconnected")
  const qualificationsRef = useRef<Qualification[]>([])
  
  // NOVO: Refs para controlar o fluxo de conexão
  const agentConnectedTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const extensionWindowRef = useRef<Window | null>(null)
  

  useEffect(() => {
    tokenRef.current = token
  }, [token])

  useEffect(() => {
    connectionStatusRef.current = connectionStatus
  }, [connectionStatus])

  // NOVO: Sincronizar callDataRef com activeCall
  useEffect(() => {
    callDataRef.current = activeCall
  }, [activeCall])

  const updateStatus = useCallback((message: string, type: StatusMessage["type"] = "info") => {
    setStatus({ message, type })
  }, [])

  // NOVO: Funções para gerenciar estado da extensão no localStorage
  const setExtensionOpen = useCallback((isOpen: boolean) => {
    if (isOpen) {
      localStorage.setItem("3c_extension_open", "true")
      console.log("📱 Marcando extensão como aberta no localStorage")
    } else {
      localStorage.removeItem("3c_extension_open")
      console.log("🚪 Removendo extensão do localStorage")
    }
  }, [])

  const isExtensionOpen = useCallback(() => {
    const isOpen = localStorage.getItem("3c_extension_open") === "true"
    console.log(`🔍 Verificando extensão no localStorage: ${isOpen ? "ABERTA" : "FECHADA"}`)
    return isOpen
  }, [])

  const resetCallState = useCallback(() => {
    console.log("🧹 Resetting call state completely")
    setActiveCall(null)
    callDataRef.current = null // NOVO: Limpar também o ref
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

  // NOVO: Função para retornar ao estado desconectado
  const returnToDisconnectedState = useCallback(() => {
    console.log("🔄 Retornando ao estado desconectado")
    
    // Limpar timeouts
    if (agentConnectedTimeoutRef.current) {
      clearTimeout(agentConnectedTimeoutRef.current)
      agentConnectedTimeoutRef.current = null
    }
    
    // Desconectar socket
    if (socketRef.current) {
      socketRef.current.removeAllListeners()
      socketRef.current.disconnect()
      socketRef.current = null
    }
    
    // Fechar janela da extensão se estiver aberta
    if (extensionWindowRef.current && !extensionWindowRef.current.closed) {
      extensionWindowRef.current.close()
      extensionWindowRef.current = null
    }
    
    // Marcar extensão como fechada
    setExtensionOpen(false)
    
    // Resetar estados
    setConnectionStatus("disconnected")
    setAgentStatus("idle")
    resetAllState()
    
    // Carregar token do localStorage se existir
    const storedToken = localStorage.getItem("3c_api_token")
    if (storedToken) {
      setToken(storedToken)
      updateStatus("Insira um Token de Operador para começar", "info")
    } else {
      updateStatus("Insira um Token de Operador para começar", "info")
    }
  }, [resetAllState, updateStatus, setExtensionOpen])

  // NOVO: Função para atualizar dados da chamada de forma mais robusta
  const updateCallData = useCallback((updates: Partial<CallData>) => {
    setActiveCall(prev => {
      if (prev) {
        const updated = { ...prev, ...updates }
        callDataRef.current = updated // Atualizar ref imediatamente
        console.log("🔄 Call data updated:", updated)
        return updated
      }
      return null
    })
  }, [])

  // NOVO: Função para finalizar chamada com dados completos
  const finalizeCall = useCallback(async () => {
    console.log("🏁 Finalizing call with complete data")
    
    const finalCallData = callDataRef.current
    if (!finalCallData) {
      console.error("❌ No call data available for finalization")
      return
    }

    // NOVO: Aguardar o link da gravação se ainda não estiver disponível
    if (!finalCallData.recordingLink) {
      console.log("⏳ Aguardando link da gravação...")
      let attempts = 0
      const maxAttempts = 20 // 10 segundos (20 * 500ms)
      
      while (!callDataRef.current?.recordingLink && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500))
        attempts++
        console.log(`⏳ Tentativa ${attempts}/${maxAttempts} - Aguardando link da gravação...`)
      }
      
      // Atualizar finalCallData com os dados mais recentes após a espera
      const updatedCallData = callDataRef.current
      if (updatedCallData?.recordingLink) {
        console.log("✅ Link da gravação obtido após espera:", updatedCallData.recordingLink)
      } else {
        console.warn("⚠️ Timeout: Link da gravação não disponível após espera.")
      }
    }
    
    // Usar os dados mais atuais do callDataRef após a espera
    const finalCallDataWithRecording = callDataRef.current
    if (!finalCallDataWithRecording) {
      console.error("❌ No call data available after waiting for recording")
      return
    }

    console.log("📊 Final call data:", finalCallDataWithRecording)

    // Notifica o HubSpot que a chamada foi completada
    const engagementData = selectedQualification ? {
      notes: `Chamada qualificada como: ${selectedQualification.name}`,
      subject: `Chamada - ${finalCallDataWithRecording.phone}`,
      qualification: selectedQualification
    } : undefined
    
    console.log("🔄 Enviando dados para notifyCallCompleted:", {
      finalCallDataWithRecording,
      engagementData,
      callStatus
    })
    
    await notifyCallCompleted(finalCallDataWithRecording, engagementData, callStatus)

    // Show completion message
    updateStatus(`Ligação finalizada: ${finalCallDataWithRecording.phone}. Pronto para nova ligação.`, "success")

    // Reset to logged_in state (dial screen)
    setAgentStatus("logged_in")

    // Reset call state after a brief delay to show the completion message
    setTimeout(() => {
      resetCallState()
      updateStatus(`Pronto para nova ligação. Campanha: ${selectedCampaign?.name || "Ativa"}`, "success")
    }, 1500)
  }, [selectedQualification, callStatus, updateStatus, resetCallState, selectedCampaign])

  // Watch for both conditions to be met and automatically transition to dial
  useEffect(() => {
    if (isCallQualified && callFinished && callDataRef.current) {
      console.log("✅ Both qualification and call finished - finalizing call")
      finalizeCall()
    }
  }, [isCallQualified, callFinished, finalizeCall])

  // NOVO: Wrapper para chamadas de API com detecção de falhas e reabertura automática
  const apiCallWithErrorHandling = useCallback(async (
    apiCall: () => Promise<Response>,
    actionName: string,
    retryAction?: () => Promise<void>
  ): Promise<Response | null> => {
    try {
      console.log(`🔄 Executando ${actionName}...`)
      const response = await apiCall()
      
      if (!response.ok) {
        console.error(`❌ ${actionName} falhou com status ${response.status}`)
        
        // Se a resposta indica que a extensão não está conectada (ex: 401, 403, 500)
        if ([401, 403, 500, 502, 503].includes(response.status)) {
          console.log("🚨 Erro indica que extensão pode estar fechada - reabrindo...")
          
          // Marcar extensão como fechada
          setExtensionOpen(false)
          
          // Mostrar mensagem ao usuário
          updateStatus("Extensão desconectada. Reabrindo automaticamente...", "info")
          
          // Reabrir extensão
          await openExtension()
          
          // Aguardar um pouco para a extensão carregar
          await new Promise(resolve => setTimeout(resolve, 3000))
          
          // Se há uma ação de retry, executá-la
          if (retryAction) {
            console.log(`🔄 Tentando ${actionName} novamente após reabrir extensão...`)
            await retryAction()
          } else {
            updateStatus("Extensão reaberta. Tente a ação novamente.", "info")
          }
          
          return null
        }
        
        throw new Error(`HTTP ${response.status}`)
      }
      
      console.log(`✅ ${actionName} executado com sucesso`)
      return response
      
    } catch (error) {
      console.error(`❌ Erro em ${actionName}:`, error)
      
      // Se é erro de rede, também tentar reabrir extensão
      if (error instanceof TypeError && error.message.includes('fetch')) {
        console.log("🚨 Erro de rede detectado - reabrindo extensão...")
        setExtensionOpen(false)
        updateStatus("Erro de conexão. Reabrindo extensão...", "info")
        await openExtension()
        
        if (retryAction) {
          await new Promise(resolve => setTimeout(resolve, 3000))
          await retryAction()
        }
      }
      
      return null
    }
  }, [updateStatus, setExtensionOpen])

  const fetchCampaigns = useCallback(async () => {
    if (!tokenRef.current || connectionStatusRef.current !== "connected") {
      console.log("❌ Cannot fetch campaigns - no token or not connected")
      return
    }

    const fetchAction = () => fetch(
      `https://app.3c.plus/api/v1/groups-and-campaigns?all=true&paused=0&api_token=${tokenRef.current}`,
    )

    const retryAction = async () => {
      // Aguardar reconexão e tentar novamente
      setTimeout(() => {
        if (connectionStatusRef.current === "connected") {
          fetchCampaigns()
        }
      }, 2000)
    }

    try {
      setIsLoading(true)
      updateStatus("Buscando campanhas...", "loading")

      const response = await apiCallWithErrorHandling(fetchAction, "buscar campanhas", retryAction)
      
      if (response) {
        const data = await response.json()
        const campaignList = data?.data?.filter((c: any) => c.type === "campaign") || []

        setCampaigns(campaignList)
        updateStatus(`${campaignList.length} campanhas encontradas. Escolha uma para fazer login.`, "success")
      }
    } catch (error) {
      console.error("❌ Error fetching campaigns:", error)
      updateStatus("Erro ao buscar campanhas. Verifique seu token.", "error")
    } finally {
      setIsLoading(false)
    }
  }, [updateStatus, apiCallWithErrorHandling])

  const loginToCampaign = useCallback(
    async (campaign: Campaign) => {
      if (!tokenRef.current || agentStatus !== "idle") {
        updateStatus("Não é possível fazer login agora", "error")
        return
      }

      const loginAction = () => fetch(
        `https://app.3c.plus/api/v1/agent/login?api_token=${encodeURIComponent(tokenRef.current)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaign: campaign.id, mode: "manual" }),
        },
      )

      const retryAction = async () => {
        // Aguardar e tentar login novamente
        setTimeout(() => {
          if (connectionStatusRef.current === "connected") {
            loginToCampaign(campaign)
          }
        }, 2000)
      }

      try {
        setIsLoading(true)
        updateStatus("Fazendo login na campanha...", "loading")

        const response = await apiCallWithErrorHandling(loginAction, "login na campanha", retryAction)

        if (response) {
          localStorage.setItem("3c_api_token", tokenRef.current)
          setSelectedCampaign(campaign)
          setCampaigns([])
          updateStatus("Login realizado com sucesso!", "success")
        }
      } catch (error) {
        console.error("❌ Login error:", error)
        updateStatus("Erro ao fazer login. Tente novamente.", "error")
      } finally {
        setIsLoading(false)
      }
    },
    [agentStatus, updateStatus, apiCallWithErrorHandling],
  )
  
  const logoutFromCampaign = useCallback(async () => {
    if (!tokenRef.current.trim()) {
      updateStatus("Token é obrigatório", "error")
      return
    }

    const logoutAction = () => fetch(
      `https://app.3c.plus/api/v1/agent/logout?api_token=${encodeURIComponent(tokenRef.current)}`,
      { method: "POST" }
    )

    try {
      setIsLoading(true)
      updateStatus("Saindo da campanha...", "loading")

      const response = await apiCallWithErrorHandling(logoutAction, "logout da campanha")

      if (response) {
        // Notifica o HubSpot e limpa todo o estado
        notifyUserLoggedOut()
        returnToDisconnectedState()
        updateStatus("Logout realizado com sucesso!", "success")
      }
    } catch (error) {
      console.error("❌ Logout error:", error)
      updateStatus("Erro ao sair da campanha", "error")
    } finally {
      setIsLoading(false)
    }
  }, [updateStatus, returnToDisconnectedState, apiCallWithErrorHandling])

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
    
    /*if (!target || agentStatus !== "logged_in") {
      updateStatus("Insira um número válido", "error")
      return
    }*/

    const callAction = () => {
      const payload = { phone: target }
      return fetch(
        `https://app.3c.plus/api/v1/agent/manual_call/dial?api_token=${encodeURIComponent(tokenRef.current)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      )
    }

    const retryAction = async () => {
      // Aguardar e tentar chamada novamente
      setTimeout(() => {
        if (connectionStatusRef.current === "connected" && agentStatus === "logged_in") {
          makeCall(target)
        }
      }, 2000)
    }

    try {
      setIsLoading(true)
      setAgentStatus("dialing")
      updateStatus("Iniciando chamada...", "loading")

      const response = await apiCallWithErrorHandling(callAction, "iniciar chamada", retryAction)
      
      if (response) {
        updateStatus(`Discando para ${target}...`, "info")
      } else {
        // Se falhou, voltar ao estado anterior
        setAgentStatus("logged_in")
      }
    } catch (error) {
      console.error("❌ Call error:", error)
      updateStatus("Erro ao iniciar chamada", "error")
      setAgentStatus("logged_in")
    } finally {
      setIsLoading(false)
    }
  }, [phoneNumber, agentStatus, updateStatus, apiCallWithErrorHandling])

  const qualifyCall = useCallback(
    async (qualification: Qualification) => {
      if (!activeCall?.telephony_id) {
        updateStatus("Não há ligação ativa para qualificar", "error")
        return
      }

      const qualifyAction = () => fetch(
        `https://app.3c.plus/api/v1/agent/manual_call/${activeCall.telephony_id}/qualify?api_token=${encodeURIComponent(tokenRef.current)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ qualification_id: String(qualification.id) }),
        },
      )

      const retryAction = async () => {
        // Aguardar e tentar qualificação novamente
        setTimeout(() => {
          if (connectionStatusRef.current === "connected" && activeCall) {
            qualifyCall(qualification)
          }
        }, 2000)
      }

      try {
        setIsLoading(true)
        updateStatus("Qualificando chamada...", "loading")

        const response = await apiCallWithErrorHandling(qualifyAction, "qualificar chamada", retryAction)

        if (response) {
          // Set selected qualification immediately for UI feedback
          setSelectedQualification(qualification)
          
          // NOVO: Atualizar dados da chamada com qualificação
          updateCallData({ qualificationName: qualification.name })
          
          updateStatus(`Qualificação usada: ${qualification.name}`, "success")
        }
      } catch (error) {
        console.error("❌ Qualification error:", error)
        updateStatus("Erro ao qualificar chamada", "error")
      } finally {
        setIsLoading(false)
      }
    },
    [activeCall, updateStatus, updateCallData, apiCallWithErrorHandling],
  )

  const hangupCall = useCallback(async () => {
    if (!activeCall?.id) return

    const hangupAction = () => fetch(
      `https://app.3c.plus/api/v1/agent/call/${activeCall.id}/hangup?api_token=${tokenRef.current}`,
      { method: "POST" },
    )

    const retryAction = async () => {
      // Aguardar e tentar hangup novamente
      setTimeout(() => {
        if (connectionStatusRef.current === "connected" && activeCall) {
          hangupCall()
        }
      }, 2000)
    }

    try {
      setIsLoading(true)
      updateStatus("Encerrando chamada...", "loading")

      // Notifica o HubSpot que a chamada está sendo encerrada
      notifyCallEnded(activeCall)

      const response = await apiCallWithErrorHandling(hangupAction, "encerrar chamada", retryAction)
      
      if (response) {
        updateStatus("Chamada encerrada com sucesso", "success")
      }
    } catch (error) {
      console.error("❌ Hangup error:", error)
      updateStatus("Erro ao encerrar chamada", "error")
    } finally {
      setIsLoading(false)
    }
  }, [activeCall, updateStatus, apiCallWithErrorHandling])

    // Initialize HubSpot calling bridge - recreate whenever agentStatus changes
  useEffect(() => {
    console.log("[3C Plus] Reinicializando HubSpot provider com agentStatus:", agentStatus)
    
    initHubspotCallProvider({
      dial: (num: string) => {
        console.log("[3C Plus] dial() chamado diretamente com:", num, typeof num)
        makeCall(num)
      },
      hangup: hangupCall,
      qualify: (qId: string) => {
        qualifyCall({ id: Number(qId), name: qId })
      },
      fillPhoneNumber: (num: string) => {
        console.log("[3C Plus] fillPhoneNumber recebido:", num, typeof num)
        const cleanNum = String(num).trim()
        console.log("[3C Plus] fillPhoneNumber limpo:", cleanNum, typeof cleanNum)
        
        // Sempre atualizar o campo de input
        setPhoneNumber(cleanNum)
        
        // Função para verificar status e discar - usando refs para ter valores mais atuais
        const checkStatusAndDial = () => {
          // Aguardar um pouco para garantir que os estados estão sincronizados
          setTimeout(() => {
            // Verificar o agentStatus atual usando callback do setState
            setAgentStatus(currentStatus => {
              console.log("[3C Plus] Status atual no momento da verificação:", currentStatus)
              
              if (currentStatus === "logged_in" && cleanNum) {
                console.log("[3C Plus] Agente logado e número válido - iniciando discagem automática")
                updateStatus(`Número ${cleanNum} recebido do HubSpot. Discando automaticamente...`, "info")
                
                // Executar a chamada
                makeCall(cleanNum)
              } else {
                console.log(`[3C Plus] Agente não está logado (${currentStatus}) - número será discado quando fizer login`)
                updateStatus(`Número ${cleanNum} preenchido pelo HubSpot. ${currentStatus !== "logged_in" ? "Aguardando login..." : "Clique em 'Discar' para iniciar a chamada."}`, "info")
              }
              
              return currentStatus // Retornar o mesmo status sem alteração
            })
          }, 200)
        }
        
        checkStatusAndDial()
      },
    })
  }, [makeCall, hangupCall, qualifyCall, updateStatus, agentStatus]) // Agora vai recriar sempre que agentStatus mudar

  const handleSocketEvent = useCallback(
    (event: string, data: any) => {
      console.log("📡 Socket event received:", event, data)

      switch (event) {
        case "connected":
          setConnectionStatus("connected")
          updateStatus("Socket conectado! Verificando status do agente...", "success")
          notifyUserAvailable()
          
          // NOVO: Fazer POST para /agent/connect automaticamente após socket conectar
          const currentToken = tokenRef.current
          if (currentToken) {
            fetch(`https://app.3c.plus/api/v1/agent/connect?api_token=${encodeURIComponent(currentToken)}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" }
            })
            .then(response => {
              if (response.ok) {
                console.log("📡 POST /agent/connect realizado automaticamente após socket conectar")
              } else {
                console.error("❌ Erro no POST /agent/connect automático:", response.status)
              }
            })
            .catch(error => {
              console.error("❌ Erro no POST /agent/connect automático:", error)
            })
          }
          break

        // NOVO: Tratamento do evento agent-is-connected
        case "agent-is-connected":
          console.log("🔗 Agent is connected event received:", data)
          
          // Limpar timeout se existir
          if (agentConnectedTimeoutRef.current) {
            clearTimeout(agentConnectedTimeoutRef.current)
            agentConnectedTimeoutRef.current = null
          }

          // Verificar o status do agente
          const agentStatus = data?.status
          
          if (agentStatus === 0) {
            // Status 0: Operador precisa fazer login (escolher campanha)
            setConnectionStatus("connected")
            setAgentStatus("idle")
            updateStatus("Operador conectado. Escolha uma campanha para fazer login.", "success")
            notifyUserAvailable()
            fetchCampaigns()
          } else if (agentStatus === 4) {
            // Status 4: Operador já está logado (tela de discagem)
            setConnectionStatus("connected")
            setAgentStatus("logged_in")
            notifyUserLoggedIn()
            updateStatus("Operador já está logado. Pronto para discar.", "success")
          } else {
            // Outros status - tratar como conectado mas aguardando
            setConnectionStatus("connected")
            updateStatus(`Operador conectado (status: ${agentStatus}). Aguardando...`, "info")
          }
          break

        // NOVO: Tratamento do evento agent-was-logged-out
        case "agent-was-logged-out":
          console.log("🚪 Agent was logged out event received:", data)
          
          // Marcar extensão como fechada no localStorage
          setExtensionOpen(false)
          
          // Retornar ao estado desconectado
          returnToDisconnectedState()
          
          updateStatus("Operador foi desconectado. Clique em 'Conectar' para reconectar.", "info")
          break

        case "agent-entered-manual":
          setAgentStatus("logged_in")
          notifyUserLoggedIn()
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
            setCallSid: data?.call?.sid,
          }
          
          setActiveCall(callData)
          callDataRef.current = callData // NOVO: Atualizar ref imediatamente
          setAgentStatus("in_call")

          // Notifica o HubSpot que uma chamada está sendo iniciada APENAS AGORA
          // O externalCallId é o telephony_id do 3C Plus
          notifyOutgoingCall(callData.phone, callData.telephony_id)

          // Reset call completion states for new call
          setIsCallQualified(false)
          setCallFinished(false)
          setSelectedQualification(null)

          // Store qualifications for when call is answered
          const dialerQuals = data?.campaign?.dialer?.qualification_list?.qualifications ?? []
          const extraQuals = data?.qualification?.qualifications ?? []

          // Junta tudo e remove duplicatas por ID
          const allQualsMap = new Map<number, { id: number; name: string }>()

          dialerQuals.forEach((q: any) => {
            allQualsMap.set(q.id, { id: q.id, name: q.name })
          })
          extraQuals.forEach((q: any) => {
            if (!allQualsMap.has(q.id)) {
              allQualsMap.set(q.id, { id: q.id, name: q.name })
            }
          })

          qualificationsRef.current = Array.from(allQualsMap.values())
          updateStatus(`Ligação conectada: ${callData.phone}`, "success")
          break

        case "manual-call-was-answered":
          setAgentStatus("call_answered")
          setQualifications(qualificationsRef.current)
          updateStatus("Ligação atendida! Qualifique quando necessário.", "info")
          
          // Notifica o HubSpot que a chamada foi atendida
          if (callDataRef.current) {
            notifyCallAnswered(callDataRef.current)
            console.log("✅ activeCall completo:", callDataRef.current)
          }
          break

        case "manual-call-was-qualified":
          console.log("📞 Call was qualified")
          const qualificationUsed = data?.qualification || data?.call?.qualification

          if (qualificationUsed) {
            setSelectedQualification({ id: qualificationUsed.id, name: qualificationUsed.name })
            
            // NOVO: Usar updateCallData para atualizar de forma mais robusta
            updateCallData({ qualificationName: qualificationUsed.name })
            
            updateStatus(``, "success")
          } else {
            updateStatus("Ligação qualificada com sucesso!", "success")
          }

          setIsCallQualified(true)
          setAgentStatus("call_qualified")
          setIsLoading(false)
          break

        case "call-was-finished":
          console.log("📞 Call was finished")
          const completedStatus = "COMPLETED"
          setCallFinished(true)
          setCallStatus(completedStatus)

          if (!isCallQualified) {
            // Call ended but not qualified yet - show qualification options
            updateStatus(`${translateCallStatus(completedStatus)}. Selecione uma qualificação.`, "info")
            setAgentStatus("call_answered")
            setQualifications(qualificationsRef.current)
          } else {
            // Call ended and already qualified - useEffect will handle transition
            updateStatus(translateCallStatus(completedStatus), "info")
          }

          setIsLoading(false) // Stop any loading states
          // The useEffect will handle the transition if qualification is also complete
          break

        case "call-was-not-answered":
          const noAnswerStatus = "NO_ANSWER"
          updateStatus(`${translateCallStatus(noAnswerStatus)}. Selecione uma qualificação.`, "info")
          
          // Notifica o HubSpot que a chamada foi finalizada (não atendida)
          if (callDataRef.current) {
            notifyCallEnded(callDataRef.current)
          }
          
          // Definir como call_answered para mostrar as qualificações
          setAgentStatus("call_answered")
          setQualifications(qualificationsRef.current)
          setCallFinished(true) // Marcar como finalizada para não mostrar botão de hangup
          setIsCallQualified(false) // Ainda não foi qualificada
          setCallStatus(noAnswerStatus)
          break

        case "call-was-failed":
          const failedStatus = "FAILED"
          updateStatus(`${translateCallStatus(failedStatus)}. Selecione uma qualificação.`, "info")
          
          // Notifica o HubSpot que a chamada foi finalizada (falhou)
          if (callDataRef.current) {
            notifyCallEnded(callDataRef.current)
          }
          
          // Definindo como call_answered para mostrar as qualificações
          setAgentStatus("call_answered")
          setQualifications(qualificationsRef.current)
          setCallFinished(true) // Marcar como finalizada para não mostrar botão de hangup
          setIsCallQualified(false) // Ainda não foi qualificada
          setCallStatus(failedStatus)
          break

        case "call-history-was-created":
          let recording_id = data.callHistory._id
          const recordingLink = `https://app.3c.plus/api/v1/calls/${recording_id}/recording`
          console.log(`Link da gravação: ${recordingLink}`)
          
          // NOVO: Usar updateCallData para atualizar de forma mais robusta
          updateCallData({ recordingLink: recordingLink })
          break

        case "agent-login-failed":
          updateStatus("Login falhou! Cheque microfone + rede, recarregue a página e tente novamente!", "error")
          returnToDisconnectedState()
          break
        
        case "disconnected":
          updateStatus("Desconectado do servidor", "error")
          returnToDisconnectedState()
          break

        default:
          console.log("🔍 Unhandled socket event:", event, data)
      }
    },
    [campaigns, selectedCampaign, phoneNumber, isCallQualified, fetchCampaigns, updateStatus, returnToDisconnectedState, updateCallData, setExtensionOpen],
  )

  const connectSocket = useCallback(() => {
  const token = tokenRef.current?.trim()
  if (!token) {
    updateStatus("Token é obrigatório", "error")
    return
  }

  if (socketRef.current) {
    socketRef.current.removeAllListeners()
    socketRef.current.disconnect()
  }

  setConnectionStatus("connecting")
  console.log("📡 Guardando o api_token")
  localStorage.setItem("3c_api_token", token)
  updateStatus("Conectando ao servidor...", "loading")

  try {
    const socket = io("https://socket.3c.plus", {
      transports: ["websocket"],
      query: { token }
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

    socket.on("connect_error", () => {
      updateStatus("Erro ao conectar. Verifique seu token.", "error")
      returnToDisconnectedState()
    })
  } catch (error) {
    updateStatus("Erro ao criar conexão", "error")
    returnToDisconnectedState()
  }
}, [handleSocketEvent, updateStatus, returnToDisconnectedState])

// NOVO: Função openExtension com controle via localStorage
const openExtension = useCallback(async () => {
  const token = tokenRef.current?.trim()
  if (!token) {
    updateStatus("Token é obrigatório", "error")
    return
  }

  // NOVO: Verificar se extensão já está aberta via localStorage
  if (isExtensionOpen()) {
    console.log("🚫 Extensão já está aberta (localStorage), não abrindo novamente")
    updateStatus("Extensão já está aberta. Aguardando conexão...", "info")
    return
  }

  const url = `https://app.3c.plus/extension?api_token=${encodeURIComponent(token)}`
  
  // Fechar janela anterior se existir
  if (extensionWindowRef.current && !extensionWindowRef.current.closed) {
    extensionWindowRef.current.close()
  }
  
  console.log("📱 Abrindo extensão:", url)
  const popup = window.open(url, "_blank", 'location=yes,height=300,width=300,scrollbars=yes,status=yes')
  extensionWindowRef.current = popup

  if (popup) {
    console.log("✅ Extensão aberta com sucesso")
    // NOVO: Marcar como aberta no localStorage
    setExtensionOpen(true)
    updateStatus("Extensão aberta em nova guia. Aguardando conexão...", "info")
    
  } else {
    console.warn("🚫 Falha ao abrir a nova aba (popup bloqueado?)")
    updateStatus("Não foi possível abrir a extensão. Verifique se o navegador bloqueou pop-ups.", "error")
  }

  const cleanup = (window as any).cleanup3CPlusExtension
  if (cleanup) {
    cleanup()
  }

  ;(window as any).cleanup3CPlusExtension = undefined
}, [updateStatus, isExtensionOpen, setExtensionOpen])

  // NOVO: Função principal de inicialização com controle via localStorage
  const startConnection = useCallback(async () => {
    const currentToken = token.trim() || localStorage.getItem("3c_api_token")
    
    if (!currentToken) {
      updateStatus("Token é obrigatório", "error")
      return
    }

    tokenRef.current = currentToken
    localStorage.setItem("3c_api_token", currentToken)

    try {
      setIsLoading(true)
      updateStatus("Verificando status do operador...", "loading")

      // 1. Conectar socket primeiro
      connectSocket()

      // 2. NOVO: Só abrir extensão se não estiver marcada como aberta no localStorage
      if (!isExtensionOpen()) {
        console.log("🔧 Extensão não está aberta, abrindo...")
        await openExtension()
      } else {
        console.log("✅ Extensão já está aberta (localStorage), apenas conectando socket")
        updateStatus("Extensão já está aberta. Conectando...", "info")
        
        // Fazer POST para /agent/connect mesmo se extensão já estiver aberta
        try {
          const response = await fetch(
            `https://app.3c.plus/api/v1/agent/connect?api_token=${encodeURIComponent(currentToken)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" }
            }
          )

          if (response.ok) {
            console.log("📡 POST /agent/connect realizado com extensão já aberta")
          } else {
            console.log("❌ POST /agent/connect falhou - extensão pode estar fechada")
            setExtensionOpen(false)
            await openExtension()
          }
        } catch (error) {
          console.log("❌ Erro no POST /agent/connect - reabrindo extensão")
          setExtensionOpen(false)
          await openExtension()
        }
      }

      // 3. Aguardar evento 'agent-is-connected' por um tempo limite
      updateStatus("Aguardando resposta do operador...", "loading")
      
      // Limpar timeout anterior se existir
      if (agentConnectedTimeoutRef.current) {
        clearTimeout(agentConnectedTimeoutRef.current)
        agentConnectedTimeoutRef.current = null
      }
      
      agentConnectedTimeoutRef.current = setTimeout(() => {
        console.log("⏰ Timeout aguardando agent-is-connected")
        if (connectionStatusRef.current !== "connected") {
          updateStatus("Timeout aguardando conexão. Verifique se a extensão está funcionando.", "error")
        }
      }, 15000) // 15 segundos de timeout

    } catch (error) {
      console.error("❌ Erro na inicialização:", error)
      updateStatus("Erro ao inicializar. Tente novamente.", "error")
    } finally {
      setIsLoading(false)
    }
  }, [token, connectSocket, openExtension, updateStatus, isExtensionOpen, setExtensionOpen])

  // NOVO: Inicialização automática melhorada
  useEffect(() => {
    const storedToken = localStorage.getItem("3c_api_token")
    if (storedToken) {
      setToken(storedToken)
      tokenRef.current = storedToken
      updateStatus("Verificando token armazenado...", "loading")
      
      // Usar setTimeout para evitar problemas de timing
      const timeoutId = setTimeout(() => {
        startConnection()
      }, 500)
      
      return () => clearTimeout(timeoutId)
    } else {
      updateStatus("Insira um Token de Operador para começar", "info")
    }
  }, []) // Sem dependências para evitar loops

  useEffect(() => {
    return () => {
      // Cleanup
      if (socketRef.current) {
        socketRef.current.removeAllListeners()
        socketRef.current.disconnect()
      }
      
      if (agentConnectedTimeoutRef.current) {
        clearTimeout(agentConnectedTimeoutRef.current)
      }
      
      if (extensionWindowRef.current && !extensionWindowRef.current.closed) {
        extensionWindowRef.current.close()
      }
      
      // NOVO: Limpar localStorage na limpeza do componente
      setExtensionOpen(false)
      
      const cleanup = (window as any).cleanup3CPlusExtension
      if (cleanup) {
        cleanup()
      }
    }
  }, [setExtensionOpen])

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
      <CardHeader className="text-center">
        <div className="mt-2">{getConnectionIcon()}</div>
        <div className="d-flex flex-column justify-content-center align-items-center">
          <img
            src="https://media.glassdoor.com/sqll/2841457/3c-plus-squareLogo-1662652407726.png"
            alt="3C Plus Logo"
            className="mx-auto"
            style={{
              height: "64px",
              objectFit: "contain",
              marginBottom: "0.4rem"
            }}
          />
          <h1
            className="fw-bold"
            style={{
              fontSize: "1.75rem",
              marginBottom: "0.25rem",
              letterSpacing: "-0.5px",
              color: "#212529",
              lineHeight: 1.2,
              fontWeight: 700
            }}
          >
            Click-to-Call
          </h1>
          <p
            style={{
              fontSize: "0.95rem",
              color: "#6c757d",
              whiteSpace: "nowrap"
            }}
          >
            Utilize a <strong>3C Plus</strong> no <strong>Hubspot</strong> 
          </p>
        </div>
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
            <Button
            onClick={logoutFromCampaign}
            disabled={isLoading}
            variant="outline"   // ou "secondary", "ghost", o que fizer sentido pra você
            className="w-full"
          >
            {isLoading && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Sair da Campanha
          </Button>
          </div>
        )}

        {showCallInfo && (
          <div className="space-y-4 p-4 bg-blue-50 rounded-lg">
            <h3 className="text-lg font-semibold">Ligação Ativa</h3>
            <div className="space-y-2">
              <p><strong>Número:</strong> {activeCall?.phone}</p>
              <p><strong>Protocolo:</strong> p-{activeCall?.setCallSid}</p>
              {/*<p><strong>ID:</strong> {activeCall?.id}</p>
              <p><strong>Telephony ID (HubSpot External Call ID):</strong> {activeCall?.telephony_id}</p>*/}
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
                  /*disabled={isLoading || selectedQualification?.id === qualification.id}*/
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