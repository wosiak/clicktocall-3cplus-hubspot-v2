import CallingExtensions from "@hubspot/calling-extensions-sdk"
import { callEndStatus } from "@hubspot/calling-extensions-sdk/dist/types/src/Constants"

export interface HubspotProviderHandlers {
  dial: (phone: string) => void
  hangup: () => void
  qualify: (qualificationId: string) => void
  fillPhoneNumber: (phone: string) => void
}

export interface CallData {
  id: string
  phone: string
  telephony_id: string
  status?: 'COMPLETED' | 'FAILED' | 'BUSY' | 'NO_ANSWER' | 'CANCELED'
  recordingLink?: string // Adicionado para o link da gravação
  qualificationName?: string // Adicionado para o nome da qualificação
}

let hubspotInstance: CallingExtensions | null = null
let currentEngagementId: string | null = null
let isUserLoggedIn: boolean = false
let isUserAvailable: boolean = false
let dialingContext: any = null // Armazena o payload completo do onDialNumber
let hubspotCallId: string | null = null
let isInitialized: boolean = false

// NOVO: Função para traduzir status da chamada para português
export function translateCallStatus(status: string): string {
  const statusTranslations: { [key: string]: string } = {
    'COMPLETED': 'Ligação completada',
    'NO_ANSWER': 'Ligação não-atendida', 
    'FAILED': 'Ligação falhou',
    'BUSY': 'Linha ocupada',
    'CANCELED': 'Ligação cancelada'
  }
  
  return statusTranslations[status] || status
}

export function initHubspotCallProvider(handlers: HubspotProviderHandlers) {
  if (typeof window === "undefined") return null
  if (hubspotInstance) return hubspotInstance

  hubspotInstance = new CallingExtensions({
    debugMode: true,
    eventHandlers: {
      onReady: () => {
        console.log("[HubSpot] SDK ready -> 3C Plus")
        
        // Aguarda um pouco antes de marcar como inicializado para garantir que o SDK esteja completamente pronto
        setTimeout(() => {
          if (hubspotInstance) {
            hubspotInstance.initialized({})
            isInitialized = true
            console.log("[HubSpot] SDK initialized successfully")
            
            // Notifica que o usuário está logado e disponível após a inicialização
            setTimeout(() => {
              notifyUserLoggedIn()
              notifyUserAvailable()
            }, 200)
          }
        }, 100)
      },
      onDialNumber: (payload: any) => {
        // CORREÇÃO: Armazenar o payload completo do onDialNumber para usar no dialingContext
        dialingContext = payload
        
        console.log("[HubSpot] onDialNumber payload completo:", payload)
        console.log("[HubSpot] Armazenando dialingContext:", dialingContext)
        
        const number = payload?.toNumber || payload?.phoneNumber || payload?.phone_number || payload?.number
        const objectId = payload?.objectId
        const objectTypeId = payload?.objectTypeId
        
        console.log(`ObjectId recebido no DialNumber: ${objectId}`)
        console.log(`ObjectTypeId recebido no DialNumber: ${objectTypeId}`)

        if (number) {
          console.log("[HubSpot] Dial number requested:", number)
          
          // Para o 3C Plus, o número deve ser sem o '+'
          const cleanNumberFor3C = number.startsWith('+') ? number.substring(1) : number
          console.log("[HubSpot] Clean number for 3C Plus:", cleanNumberFor3C)
          handlers.fillPhoneNumber(cleanNumberFor3C)
        }
      },
      onEndCall: () => {
        console.log("[HubSpot] End call requested")
        handlers.hangup()
      },
      onCreateEngagementSucceeded: (data: any) => {
        console.log("[HubSpot] Engagement created successfully:", data)
        currentEngagementId = data?.engagement?.id || data?.engagementId
        if (data?.callEndStatus) {
          handlers.qualify(String(data.callEndStatus))
        }
      },
      onCreateEngagementFailed: (data: any) => {
        console.error("[HubSpot] Failed to create engagement:", data)
        sendError({
          message: "Failed to create engagement",
          error: JSON.stringify(data)
        })
      },
      onNavigateToRecordFailed: (data: any) => {
        console.error("[HubSpot] Failed to navigate to record:", data)
        sendError({
          message: "Failed to navigate to record",
          error: JSON.stringify(data)
        })
      },
      onInitiateCallIdSucceeded: (data: any) => {
        hubspotCallId = data?.callId
        console.log("[HubSpot] Recebendo o call id:", hubspotCallId)
        console.log("Recebendo data completo do callidSucceeded:", data)
      },
      onPublishToChannelFailed: (data: any) => {
        console.error("[HubSpot] Failed to publish to channel:", data)
        sendError({
          message: "Failed to publish to channel",
          error: JSON.stringify(data)
        })
      },
      onCallerIdMatchFailed: (data: any) => {
        console.error("[HubSpot] Failed to match caller ID:", data)
        sendError({
          message: "Failed to match caller ID",
          error: JSON.stringify(data)
        })
      },
      onVisibilityChanged: (data: any) => {
        console.log("[HubSpot] Visibility changed:", data)
      },
      defaultEventHandler: (ev: any) => {
        console.log("[HubSpot] Event -> 3C Plus", ev)
      },
    },
  })

  ;(window as any).HubSpotConversations = hubspotInstance
  return hubspotInstance
}

// Função para aguardar a inicialização do SDK
function waitForInitialization(): Promise<void> {
  return new Promise((resolve) => {
    if (isInitialized) {
      resolve()
      return
    }
    
    const checkInterval = setInterval(() => {
      if (isInitialized) {
        clearInterval(checkInterval)
        resolve()
      }
    }, 50)
    
    // Timeout após 5 segundos
    setTimeout(() => {
      clearInterval(checkInterval)
      console.warn("[HubSpot] Initialization timeout - proceeding anyway")
      resolve()
    }, 5000)
  })
}

// Notifica que o usuário fez login
export async function notifyUserLoggedIn() {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  await waitForInitialization()

  if (!isUserLoggedIn) {
    console.log("[HubSpot] Notifying user logged in")
    try {
      hubspotInstance.userLoggedIn()
      isUserLoggedIn = true
    } catch (error) {
      console.error("[HubSpot] Error notifying user logged in:", error)
    }
  }
}

// Notifica que o usuário está disponível
export async function notifyUserAvailable() {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  await waitForInitialization()

  if (!isUserAvailable) {
    console.log("[HubSpot] Notifying user available")
    try {
      hubspotInstance.userAvailable()
      isUserAvailable = true
    } catch (error) {
      console.error("[HubSpot] Error notifying user available:", error)
    }
  }
}

// Notifica que o usuário não está disponível
export async function notifyUserUnavailable() {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  await waitForInitialization()

  if (isUserAvailable) {
    console.log("[HubSpot] Notifying user unavailable")
    try {
      hubspotInstance.userUnavailable()
      isUserAvailable = false
    } catch (error) {
      console.error("[HubSpot] Error notifying user unavailable:", error)
    }
  }
}

// Notifica que o usuário fez logout
export async function notifyUserLoggedOut() {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  await waitForInitialization()

  if (isUserLoggedIn) {
    console.log("[HubSpot] Notifying user logged out")
    try {
      hubspotInstance.userLoggedOut()
      isUserLoggedIn = false
      isUserAvailable = false
      
      // Reset do dialingContext quando o usuário faz logout
      dialingContext = null
    } catch (error) {
      console.error("[HubSpot] Error notifying user logged out:", error)
    }
  }
}

// Notifica o HubSpot que uma chamada foi iniciada
export async function notifyOutgoingCall(phoneNumber: string, externalCallId: string) {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  await waitForInitialization()

  // Garante que o usuário está logado e disponível antes de iniciar chamada
  if (!isUserLoggedIn) {
    await notifyUserLoggedIn()
  }
  if (!isUserAvailable) {
    await notifyUserAvailable()
  }

  console.log("[HubSpot] Notifying outgoing call:", phoneNumber, "with externalCallId:", externalCallId)
  console.log("[HubSpot] Using dialingContext:", dialingContext)
  
  // Garante que o número para o HubSpot tenha o '+'
  let formattedPhoneNumberForHubspot = phoneNumber
  if (!formattedPhoneNumberForHubspot.startsWith('+')) {
    formattedPhoneNumberForHubspot = '+' + formattedPhoneNumberForHubspot
  }

  const outgoingCallData: any = {
    toNumber: formattedPhoneNumberForHubspot,
    callStartTime: Date.now(),
    createEngagement: true,
    fromNumber: "+5542999998888",
    externalCallId: externalCallId,
    dialingContext: dialingContext // Usar a variável dialingContext diretamente
  }

  console.log("[HubSpot] Outgoing call data:", outgoingCallData)
  
  try {
    hubspotInstance.outgoingCall(outgoingCallData)
  } catch (error) {
    console.error("[HubSpot] Error notifying outgoing call:", error)
    sendError({
      message: "Error notifying outgoing call",
      error: error instanceof Error ? error.message : "Unknown error"
    })
  }
}

// Notifica o HubSpot que uma chamada foi atendida
export async function notifyCallAnswered(callData: CallData) {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  await waitForInitialization()

  const externalCallId = callData.telephony_id
  if (!externalCallId) {
    console.error("[HubSpot] Cannot notify call answered - no valid externalCallId (telephony_id)")
    return
  }

  console.log("[HubSpot] Notifying call answered:", callData.phone, "with externalCallId:", externalCallId)
  
  const callAnsweredData = {
    externalCallId: externalCallId
  }
  
  console.log("[HubSpot] Call answered data:", callAnsweredData)
  
  try {
    hubspotInstance.callAnswered(callAnsweredData)
  } catch (error) {
    console.error("[HubSpot] Error notifying call answered:", error)
    sendError({
      message: "Error notifying call answered",
      error: error instanceof Error ? error.message : "Unknown error"
    })
  }
}

// Notifica o HubSpot que uma chamada foi finalizada
export async function notifyCallEnded(callData: CallData) {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  await waitForInitialization()

  const externalCallId = callData.telephony_id
  if (!externalCallId) {
    console.error("[HubSpot] Cannot notify call ended - no valid externalCallId (telephony_id)")
    return
  }

  console.log("[HubSpot] Notifying call ended:", callData.phone, "with externalCallId:", externalCallId)
  
  const callEndedData = {
    externalCallId: externalCallId,
    engagementId: currentEngagementId,
    callEndStatus: "COMPLETED"
  }
  
  console.log("[HubSpot] Call ended data:", callEndedData)
  
  try {
    hubspotInstance.callEnded(callEndedData)
  } catch (error) {
    console.error("[HubSpot] Error notifying call ended:", error)
    sendError({
      message: "Error notifying call ended",
      error: error instanceof Error ? error.message : "Unknown error"
    })
  }
}

// Notifica o HubSpot que o processo de chamada foi completado
// Função notifyCallCompleted corrigida no hubspot-call-provider.ts

export async function notifyCallCompleted(callData: CallData, engagementData?: any, callStatus: string = 'COMPLETED') {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  await waitForInitialization()

  const externalCallId = callData.telephony_id
  if (!externalCallId) {
    console.error("[HubSpot] Cannot notify call completed - no valid externalCallId (telephony_id)")
    return
  }

  console.log("[HubSpot] Notifying call completed:", callData.phone, "with status:", callStatus, "and externalCallId:", externalCallId)
  console.log("[HubSpot] CallData completo recebido:", callData) // DEBUG ADICIONAL
  console.log("[HubSpot] 🌐 Status traduzido:", callStatus, "→", translateCallStatus(callStatus)) // DEBUG TRADUÇÃO
  
  // NOVO: Aguardar um pouco mais se o link da gravação ainda não estiver disponível
  if (!callData.recordingLink || callData.recordingLink === 'undefined') {
    console.log("[HubSpot] ⏳ Link da gravação não disponível, aguardando um pouco mais...")
    await new Promise(resolve => setTimeout(resolve, 1000)) // Aguardar 1 segundo adicional
  }
  
  // Garante que o número para o HubSpot tenha o '+'
  let formattedPhoneNumberForHubspot = callData.phone
  if (!formattedPhoneNumberForHubspot.startsWith('+')) {
    formattedPhoneNumberForHubspot = '+' + formattedPhoneNumberForHubspot
  }
  
  // CORREÇÃO: Construir o hs_call_body com verificações mais robustas
  const translatedStatus = translateCallStatus(callStatus)
  let callBody = `<p><strong>Número:</strong> ${callData.phone}</p>\n<p><strong>Status:</strong> ${translatedStatus}</p>`
  
  // CORREÇÃO: Verificações mais robustas para evitar valores undefined/null
  console.log("[HubSpot] 🔍 Verificando recordingLink:", {
    recordingLink: callData.recordingLink,
    type: typeof callData.recordingLink,
    hasValue: !!(callData.recordingLink && callData.recordingLink.trim() && callData.recordingLink !== 'undefined')
  })
  
  console.log("[HubSpot] 🔍 Verificando qualificationName:", {
    qualificationName: callData.qualificationName,
    type: typeof callData.qualificationName,
    hasValue: !!(callData.qualificationName && callData.qualificationName.trim() && callData.qualificationName !== 'undefined')
  })
  
  // Verificar se temos link de gravação
  if (callData.recordingLink && callData.recordingLink.trim() && callData.recordingLink !== 'undefined') {
    callBody += `\n<p><strong>Link da Gravação:</strong> <a href="${callData.recordingLink}" target="_blank">Clique aqui para baixar</a></p>`
    console.log("[HubSpot] ✅ Adicionando link de gravação:", callData.recordingLink)
  } else {
    console.log("[HubSpot] ⚠️ Nenhum link de gravação válido encontrado")
  }
  
  // Verificar se temos qualificação
  if (callData.qualificationName && callData.qualificationName.trim() && callData.qualificationName !== 'undefined') {
    callBody += `\n<p><strong>Qualificação:</strong> ${callData.qualificationName}</p>`
    console.log("[HubSpot] ✅ Adicionando qualificação:", callData.qualificationName)
  } else {
    console.log("[HubSpot] ⚠️ Nenhuma qualificação válida encontrada")
  }

  // CORREÇÃO: Se temos engagementData com qualification, usar como fallback
  if (!callData.qualificationName && engagementData?.qualification?.name) {
    callBody += `\n<p><strong>Qualificação:</strong> ${engagementData.qualification.name}</p>`
    console.log("[HubSpot] ✅ Usando qualificação do engagementData:", engagementData.qualification.name)
  }

  console.log("[HubSpot] 📝 Call body final:", callBody) // DEBUG DO BODY FINAL

  const completionData: any = {
    engagementId: currentEngagementId,
    externalCallId: callData.telephony_id,
    hideWidget: false,
    engagementProperties: {
      hs_call_status: callStatus,
      hs_timestamp: Date.now(),
      hs_call_title: `Chamada - ${formattedPhoneNumberForHubspot}`,
      hs_call_direction: `OUTBOUND`,
      hs_call_body: callBody,
      hs_call_recording_url: callData.recordingLink
    }
  }

  // Se temos dados de engagement, incluímos
  if (engagementData || currentEngagementId) {
    if (currentEngagementId) {
      completionData.engagementId = currentEngagementId
    }
    if (engagementData) {
      completionData.body = engagementData.notes || `Chamada para ${formattedPhoneNumberForHubspot}`
      completionData.subject = engagementData.subject || `Chamada - ${formattedPhoneNumberForHubspot}`
    }
  }

  // Valores padrão se não fornecidos
  if (!completionData.body) {
    completionData.body = `Chamada para ${formattedPhoneNumberForHubspot}`
  }
  if (!completionData.subject) {
    completionData.subject = `Chamada - ${formattedPhoneNumberForHubspot}`
  }

  console.log("[HubSpot] 📊 Call completed data final:", completionData)
  
  try {
    hubspotInstance.callCompleted(completionData)
    console.log("[HubSpot] ✅ callCompleted enviado com sucesso!")
  } catch (error) {
    console.error("[HubSpot] Error notifying call completed:", error)
    sendError({
      message: "Error notifying call completed",
      error: error instanceof Error ? error.message : "Unknown error"
    })
  }
  
  // Reset do engagement ID e do hubspotCallId após completar
  currentEngagementId = null
  hubspotCallId = null
}

// Enviar erro para o HubSpot
export async function sendError(errorData: any) {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  await waitForInitialization()

  console.log("[HubSpot] Sending error:", errorData)
  
  try {
    hubspotInstance.sendError(errorData)
  } catch (error) {
    console.error("[HubSpot] Error sending error to HubSpot:", error)
  }
}

// Redimensionar widget
export async function resizeWidget(dimensions: { width: number; height: number }) {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  await waitForInitialization()

  console.log("[HubSpot] Resizing widget:", dimensions)
  
  try {
    hubspotInstance.resizeWidget(dimensions)
  } catch (error) {
    console.error("[HubSpot] Error resizing widget:", error)
  }
}

// Função para obter a instância do HubSpot (para uso direto se necessário)
export function getHubspotInstance() {
  return hubspotInstance
}

// Função para obter o ID do engagement atual
export function getCurrentEngagementId() {
  return currentEngagementId
}

// Função para obter o dialingContext atual
export function getDialingContext() {
  return dialingContext
}

// Obter status do usuário
export function getUserStatus() {
  return {
    isLoggedIn: isUserLoggedIn,
    isAvailable: isUserAvailable,
    isInitialized: isInitialized
  }
}