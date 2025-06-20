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
let isInitialized: boolean = false

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
        const number = payload?.toNumber || payload?.phoneNumber || payload?.number
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
  
  // Garante que o número para o HubSpot tenha o '+'
  let formattedPhoneNumberForHubspot = phoneNumber
  if (!formattedPhoneNumberForHubspot.startsWith('+')) {
    formattedPhoneNumberForHubspot = '+' + formattedPhoneNumberForHubspot
  }
  
  const outgoingCallData: any = {
    phoneNumber: formattedPhoneNumberForHubspot,
    callStartTime: Date.now(),
    createEngagement: true,
    externalCallId: externalCallId
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
    callEndTime: Date.now()
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
  
  try {
    hubspotInstance.callCompleted(completionData)
  } catch (error) {
    console.error("[HubSpot] Error notifying call completed:", error)
    sendError({
      message: "Error notifying call completed",
      error: error instanceof Error ? error.message : "Unknown error"
    })
  }
  
  // Reset do engagement ID após completar
  currentEngagementId = null
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

// Obter status do usuário
export function getUserStatus() {
  return {
    isLoggedIn: isUserLoggedIn,
    isAvailable: isUserAvailable,
    isInitialized: isInitialized
  }
}