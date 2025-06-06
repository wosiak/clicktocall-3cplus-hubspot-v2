import CallingExtensions from "@hubspot/calling-extensions-sdk"

export interface HubspotProviderHandlers {
  dial: (phone: string) => void
  hangup: () => void
  qualify: (qualificationId: string) => void
  getAvailability?: () => boolean
  getLoginStatus?: () => boolean
}

let hubspotInstance: CallingExtensions | null = null

export function initHubspotCallProvider(handlers: HubspotProviderHandlers) {
  if (typeof window === "undefined") return null
  if (hubspotInstance) return hubspotInstance

  hubspotInstance = new CallingExtensions({
    debugMode: true,
    eventHandlers: {
      onReady: () => {
        console.log("[HubSpot] SDK ready")
        hubspotInstance?.initialized({})

        // Emit login status
        if (handlers.getLoginStatus?.()) {
          hubspotInstance?.userLoggedIn()
        } else {
          hubspotInstance?.userLoggedOut()
        }

        // Emit availability
        if (handlers.getAvailability?.()) {
          hubspotInstance?.userAvailable()
        } else {
          hubspotInstance?.userUnavailable()
        }
      },

      onDialNumber: (payload: any) => {
        const number = payload?.toNumber || payload?.phoneNumber || payload?.number
        if (number) handlers.dial(number)

        hubspotInstance?.outgoingCall({ phoneNumber: number })
      },

      onEndCall: () => {
        handlers.hangup()
        hubspotInstance?.callEnded({})
      },

      onCreateEngagementSucceeded: (data: any) => {
        if (data?.callEndStatus) {
          handlers.qualify(String(data.callEndStatus))
          hubspotInstance?.callCompleted({ status: data.callEndStatus })
        }
      },

      defaultEventHandler: (ev: any) => {
        console.log("[HubSpot] Event", ev)
      },
    },
  })

  ;(window as any).HubSpotConversations = hubspotInstance
  return hubspotInstance
}

