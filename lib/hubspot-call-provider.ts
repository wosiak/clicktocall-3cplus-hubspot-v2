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
        hubspotInstance?.initialized({})
        hubspotInstance?.userAvailable({})
        // Notifica que o usuário está logado e disponível assim que o SDK estiver pronto
        setTimeout(() => {
          notifyUserLoggedIn()
          notifyUserAvailable()
        }, 100)
      },
      onDialNumber: (payload: any) => {
        const number = payload?.toNumber || payload?.phoneNumber || payload?.number
        if (number) {
          console.log("[HubSpot] Dial number requested:", number)
          
          // Garante que o número para o HubSpot tenha o '+'
          let formattedNumberForHubspot = number
          if (!formattedNumberForHubspot.startsWith('+')) {
            formattedNumberForHubspot = '+' + formattedNumberForHubspot // Assumindo +55 para números brasileiros
          }
          console.log("[HubSpot] Formatted number for HubSpot:", formattedNumberForHubspot)

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

  // Garante que o usuário está logado e disponível antes de iniciar chamada
  if (!isUserLoggedIn) {
    notifyUserLoggedIn()
  }
  if (!isUserAvailable) {
    notifyUserAvailable()
  }

  console.log("[HubSpot] Notifying outgoing call:", phoneNumber, "with externalCallId:", externalCallId)
  
  // Garante que o número para o HubSpot tenha o '+'
  let formattedPhoneNumberForHubspot = phoneNumber
  if (!formattedPhoneNumberForHubspot.startsWith('+')) {
    formattedPhoneNumberForHubspot = '+' + formattedPhoneNumberForHubspot // Assumindo +55 para números brasileiros
  }
  
  const outgoingCallData: any = {
    phoneNumber: formattedPhoneNumberForHubspot, // Usar o número formatado para HubSpot
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
  
  // Garante que o número para o HubSpot tenha o '+'
  let formattedPhoneNumberForHubspot = callData.phone
  if (!formattedPhoneNumberForHubspot.startsWith('+')) {
    formattedPhoneNumberForHubspot = '+' + formattedPhoneNumberForHubspot
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
      completionData.body = engagementData.notes || `Chamada para ${formattedPhoneNumberForHubspot}`
      completionData.subject = engagementData.subject || `Chamada - ${formattedPhoneNumberForHubspot}`
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

