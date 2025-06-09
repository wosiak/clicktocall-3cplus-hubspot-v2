/*import CallingExtensions from "@hubspot/calling-extensions-sdk"

export interface HubspotProviderHandlers {
  dial: (phone: string) => void
  hangup: () => void
  qualify: (qualificationId: string) => void
}

let hubspotInstance: CallingExtensions | null = null

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
        if (number) handlers.dial(number)
      },
      onEndCall: () => {
        handlers.hangup()
      },
      onCreateEngagementSucceeded: (data: any) => {
        if (data?.callEndStatus) {
          handlers.qualify(String(data.callEndStatus))
        }
      },
      defaultEventHandler: (ev: any) => {
        console.log("[HubSpot] Event -> 3C Plus", ev)
      },
    },
  })

  ;(window as any).HubSpotConversations = hubspotInstance
  return hubspotInstance
}
import CallingExtensions from "@hubspot/calling-extensions-sdk"

export interface HubspotProviderHandlers {
  dial: (phone: string) => void
  hangup: () => void
  qualify: (qualificationId: string) => void
}

export interface CallData {
  id: string
  phone: string
  telephony_id: string
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
          console.log("[HubSpot] Dial number requested -> 3C Plus:", number)
          handlers.dial(number)
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
export function notifyOutgoingCall(phoneNumber: string, callId?: string) {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  console.log("[HubSpot] Notifying outgoing call:", phoneNumber)
  hubspotInstance.outgoingCall({
    phoneNumber,
    callStartTime: Date.now(),
    createEngagement: true,
    ...(callId && { callId })
  })
}

// Notifica o HubSpot que uma chamada foi atendida
export function notifyCallAnswered(callData: CallData) {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  console.log("[HubSpot] Notifying call answered:", callData.phone)
  hubspotInstance.callAnswered({
    externalCallId: callData.id || callData.telephony_id
  })
}

// Notifica o HubSpot que uma chamada foi finalizada
export function notifyCallEnded(callData: CallData) {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  console.log("[HubSpot] Notifying call ended:", callData.phone)
  hubspotInstance.callEnded({
    externalCallId: callData.id || callData.telephony_id,
    callEndTime: Date.now()
  })
}

// Notifica o HubSpot que o processo de chamada foi completado
export function notifyCallCompleted(callData: CallData, engagementData?: any) {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  console.log("[HubSpot] Notifying call completed:", callData.phone)
  
  const completionData: any = {
    externalCallId: callData.id || callData.telephony_id,
    callEndTime: Date.now()
  }

  // Se temos dados de engagement, incluímos
  if (engagementData || currentEngagementId) {
    completionData.engagementId = currentEngagementId
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
*/
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
export function notifyOutgoingCall(phoneNumber: string, callId?: string) {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  console.log("[HubSpot] Notifying outgoing call:", phoneNumber)
  hubspotInstance.outgoingCall({
    phoneNumber,
    callStartTime: Date.now(),
    createEngagement: true,
    ...(callId && { callId })
  })
}

// Notifica o HubSpot que uma chamada foi atendida
export function notifyCallAnswered(callData: CallData) {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  console.log("[HubSpot] Notifying call answered:", callData.phone)
  hubspotInstance.callAnswered({
    externalCallId: callData.id || callData.telephony_id
  })
}

// Notifica o HubSpot que uma chamada foi finalizada
export function notifyCallEnded(callData: CallData) {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  console.log("[HubSpot] Notifying call ended:", callData.phone)
  hubspotInstance.callEnded({
    externalCallId: callData.id || callData.telephony_id,
    callEndTime: Date.now()
  })
}

// Notifica o HubSpot que o processo de chamada foi completado
export function notifyCallCompleted(callData: CallData, engagementData?: any) {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized")
    return
  }

  console.log("[HubSpot] Notifying call completed:", callData.phone)
  
  const completionData: any = {
    externalCallId: callData.id || callData.telephony_id,
    callEndTime: Date.now()
  }

  // Se temos dados de engagement, incluímos
  if (engagementData || currentEngagementId) {
    completionData.engagementId = currentEngagementId
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
