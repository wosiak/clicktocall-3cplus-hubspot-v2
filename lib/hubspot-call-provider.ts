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

export function initHubspotCallProvider(handlers: HubspotProviderHandlers) {
  if (typeof window === "undefined") return null
  if (hubspotInstance) return hubspotInstance

  hubspotInstance = new CallingExtensions({
    debugMode: true,
    eventHandlers: {
      onReady: () => {
        hubspotInstance?.initialized({})
        console.log("[HubSpot] SDK ready -> 3C Plus")  
      },
      onDialNumber: (payload: any) => {
        const number = payload?.toNumber || payload?.phoneNumber || payload?.number
        if (number) {
          console.log("[HubSpot] Dial number requested:", number)
          // Remove o '+' do início do número se existir
          const cleanNumber = number.startsWith('+') ? number.substring(1) : number
          console.log("[HubSpot] Clean number (without +):", cleanNumber)
          // Ao invés de discar automaticamente, apenas preenche o campo
          handlers.fillPhoneNumber(cleanNumber)
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
      },
      defaultEventHandler: (ev: any) => {
        console.log("[HubSpot] Event -> 3C Plus", ev)
      },
    },
  })

  ;(window as any).HubSpotConversations = hubspotInstance
  return hubspotInstance
}

// Notifica o HubSpot que uma chamada foi iniciada
// O externalCallId será o telephony_id do 3C Plus, que só estará disponível após a conexão da chamada
export function notifyOutgoingCall(phoneNumber: string, externalCallId: string) {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  console.log("[HubSpot] Notifying outgoing call:", phoneNumber, "with externalCallId:", externalCallId)
  
  const outgoingCallData: any = {
    phoneNumber,
    callStartTime: Date.now(),
    createEngagement: true,
    externalCallId: externalCallId // Adiciona o externalCallId
  }

  hubspotInstance.outgoingCall(outgoingCallData)
}

// Notifica o HubSpot que uma chamada foi atendida
export function notifyCallAnswered(callData: CallData) {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  // O externalCallId é o telephony_id do 3C Plus
  const externalCallId = callData.telephony_id
  if (!externalCallId) {
    console.error("[HubSpot] Cannot notify call answered - no valid externalCallId (telephony_id)")
    return
  }

  console.log("[HubSpot] Notifying call answered:", callData.phone, "with externalCallId:", externalCallId)
  hubspotInstance.callAnswered({
    externalCallId: externalCallId
  })
}

// Notifica o HubSpot que uma chamada foi finalizada
export function notifyCallEnded(callData: CallData) {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  // O externalCallId é o telephony_id do 3C Plus
  const externalCallId = callData.telephony_id
  if (!externalCallId) {
    console.error("[HubSpot] Cannot notify call ended - no valid externalCallId (telephony_id)")
    return
  }

  console.log("[HubSpot] Notifying call ended:", callData.phone, "with externalCallId:", externalCallId)
  hubspotInstance.callEnded({
    externalCallId: externalCallId,
    callEndTime: Date.now()
  })
}

// Notifica o HubSpot que o processo de chamada foi completado
export function notifyCallCompleted(callData: CallData, engagementData?: any, callStatus: string = 'COMPLETED') {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  // O externalCallId é o telephony_id do 3C Plus
  const externalCallId = callData.telephony_id
  if (!externalCallId) {
    console.error("[HubSpot] Cannot notify call completed - no valid externalCallId (telephony_id)")
    return
  }

  console.log("[HubSpot] Notifying call completed:", callData.phone, "with status:", callStatus, "and externalCallId:", externalCallId)
  
  const completionData: any = {
    externalCallId: externalCallId,
    callEndTime: Date.now(),
    hsCallStatus: callStatus // Campo obrigatório
  }

  // Se temos dados de engagement, incluímos
  if (engagementData || currentEngagementId) {
    if (currentEngagementId) {
      completionData.engagementId = currentEngagementId
    }
    if (engagementData) {
      completionData.body = engagementData.notes || `Chamada para ${callData.phone}`
      completionData.subject = engagementData.subject || `Chamada - ${callData.phone}`
    }
  }

  hubspotInstance.callCompleted(completionData)
  
  // Reset do engagement ID após completar
  currentEngagementId = null
}

// Função para obter a instância do HubSpot (para uso direto se necessário)
export function getHubspotInstance() {
  return hubspotInstance
}

// Função para obter o ID do engagement atual
export function getCurrentEngagementId() {
  return currentEngagementId
}