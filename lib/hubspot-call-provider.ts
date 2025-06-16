import CallingExtensions from "@hubspot/calling-extensions-sdk"

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
}

let hubspotInstance: CallingExtensions | null = null
let currentEngagementId: string | null = null
let isUserLoggedIn: boolean = false
let isUserAvailable: boolean = false

export function initHubspotCallProvider(handlers: HubspotProviderHandlers) {
  if (typeof window === "undefined") return null
  if (hubspotInstance) return hubspotInstance

  hubspotInstance = new CallingExtensions({
    debugMode: true,
    eventHandlers: {
      onReady: () => {
        console.log("[HubSpot] SDK ready -> 3C Plus")
        // Notifica que o SDK foi inicializado
        hubspotInstance?.initialized({})
        
        // Automaticamente marca o usuário como logado e disponível
        // quando o SDK estiver pronto
        setTimeout(() => {
          notifyUserLoggedIn()
          notifyUserAvailable()
        }, 100)
      },
      onDialNumber: (payload: any) => {
        const number = payload?.toNumber || payload?.phoneNumber || payload?.number
        if (number) {
          console.log("[HubSpot] Dial number requested:", number)
          
          // CORREÇÃO: Manter o formato internacional com + para o HubSpot
          // Apenas garantir que o número tenha o formato correto
          let formattedNumber = number
          if (!formattedNumber.startsWith("+")) {
            // Se não tem +, adicionar (assumindo que é um número brasileiro)
            formattedNumber = "+55" + formattedNumber
          }
          
          console.log("[HubSpot] Formatted number:", formattedNumber)
          
          // Para o 3C Plus, remover o + apenas na interface
          const cleanNumberFor3C = formattedNumber.startsWith("+") ? formattedNumber.substring(1) : formattedNumber
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
        // Tentar novamente após um breve delay
        setTimeout(() => {
          console.log("[HubSpot] Retrying engagement creation...")
        }, 1000)
      },
      onNavigateToRecordFailed: (data: any) => {
        console.error("[HubSpot] Failed to navigate to record:", data)
      },
      onPublishToChannelFailed: (data: any) => {
        console.error("[HubSpot] Failed to publish to channel:", data)
      },
      onCallerIdMatchFailed: (data: any) => {
        console.error("[HubSpot] Failed to match caller ID:", data)
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

// NOVA FUNÇÃO: Notifica que o usuário fez login
export function notifyUserLoggedIn() {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  if (!isUserLoggedIn) {
    console.log("[HubSpot] Notifying user logged in")
    hubspotInstance.userLoggedIn()
    isUserLoggedIn = true
  }
}

// NOVA FUNÇÃO: Notifica que o usuário está disponível
export function notifyUserAvailable() {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  if (!isUserAvailable) {
    console.log("[HubSpot] Notifying user available")
    hubspotInstance.userAvailable()
    isUserAvailable = true
  }
}

// NOVA FUNÇÃO: Notifica que o usuário não está disponível
export function notifyUserUnavailable() {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  if (isUserAvailable) {
    console.log("[HubSpot] Notifying user unavailable")
    hubspotInstance.userUnavailable()
    isUserAvailable = false
  }
}

// NOVA FUNÇÃO: Notifica que o usuário fez logout
export function notifyUserLoggedOut() {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  if (isUserLoggedIn) {
    console.log("[HubSpot] Notifying user logged out")
    hubspotInstance.userLoggedOut()
    isUserLoggedIn = false
    isUserAvailable = false
  }
}

// Notifica o HubSpot que uma chamada foi iniciada
export function notifyOutgoingCall(phoneNumber: string, externalCallId: string) {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  // Garantir que o usuário está logado e disponível antes de iniciar chamada
  if (!isUserLoggedIn) {
    notifyUserLoggedIn()
  }
  if (!isUserAvailable) {
    notifyUserAvailable()
  }

  console.log("[HubSpot] Notifying outgoing call:", phoneNumber, "with externalCallId:", externalCallId)
  
  // CORREÇÃO: Garantir que o número tenha o formato internacional
  let formattedPhoneNumber = phoneNumber
  if (!formattedPhoneNumber.startsWith("+")) {
    // Assumindo números brasileiros se não tiver código do país
    formattedPhoneNumber = "+55" + phoneNumber
  }
  
  const outgoingCallData: any = {
    phoneNumber: formattedPhoneNumber, // Usar o número formatado
    callStartTime: Date.now(),
    createEngagement: true,
    externalCallId: externalCallId
  }

  console.log("[HubSpot] Outgoing call data:", outgoingCallData)
  hubspotInstance.outgoingCall(outgoingCallData)
}

// Notifica o HubSpot que uma chamada foi atendida
export function notifyCallAnswered(callData: CallData) {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

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
  hubspotInstance.callAnswered(callAnsweredData)
}

// Notifica o HubSpot que uma chamada foi finalizada
export function notifyCallEnded(callData: CallData) {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  const externalCallId = callData.telephony_id
  if (!externalCallId) {
    console.error("[HubSpot] Cannot notify call ended - no valid externalCallId (telephony_id)")
    return
  }

  console.log("[HubSpot] Notifying call ended:", callData.phone, "with externalCallId:", externalCallId)
  
  const callEndedData = {
    externalCallId: externalCallId,
    callEndTime: Date.now()
  }
  
  console.log("[HubSpot] Call ended data:", callEndedData)
  hubspotInstance.callEnded(callEndedData)
}

// Notifica o HubSpot que o processo de chamada foi completado
export function notifyCallCompleted(callData: CallData, engagementData?: any, callStatus: string = 'COMPLETED') {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  const externalCallId = callData.telephony_id
  if (!externalCallId) {
    console.error("[HubSpot] Cannot notify call completed - no valid externalCallId (telephony_id)")
    return
  }

  console.log("[HubSpot] Notifying call completed:", callData.phone, "with status:", callStatus, "and externalCallId:", externalCallId)
  
  // CORREÇÃO: Garantir que o número tenha o formato internacional
  let formattedPhoneNumber = callData.phone
  if (!formattedPhoneNumber.startsWith("+")) {
    formattedPhoneNumber = "+55" + callData.phone
  }
  
  const completionData: any = {
    externalCallId: externalCallId,
    callEndTime: Date.now(),
    hsCallStatus: callStatus
  }

  // Se temos dados de engagement, incluímos
  if (engagementData || currentEngagementId) {
    if (currentEngagementId) {
      completionData.engagementId = currentEngagementId
    }
    if (engagementData) {
      completionData.body = engagementData.notes || `Chamada para ${formattedPhoneNumber}`
      completionData.subject = engagementData.subject || `Chamada - ${formattedPhoneNumber}`
    }
  }

  console.log("[HubSpot] Call completed data:", completionData)
  hubspotInstance.callCompleted(completionData)
  
  // Reset do engagement ID após completar
  currentEngagementId = null
}

// NOVA FUNÇÃO: Enviar erro para o HubSpot
export function sendError(errorData: any) {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  console.log("[HubSpot] Sending error:", errorData)
  hubspotInstance.sendError(errorData)
}

// NOVA FUNÇÃO: Redimensionar widget
export function resizeWidget(dimensions: { width: number; height: number }) {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  console.log("[HubSpot] Resizing widget:", dimensions)
  hubspotInstance.resizeWidget(dimensions)
}

// Função para obter a instância do HubSpot (para uso direto se necessário)
export function getHubspotInstance() {
  return hubspotInstance
}

// Função para obter o ID do engagement atual
export function getCurrentEngagementId() {
  return currentEngagementId
}

// NOVA FUNÇÃO: Obter status do usuário
export function getUserStatus() {
  return {
    isLoggedIn: isUserLoggedIn,
    isAvailable: isUserAvailable
  }
}
