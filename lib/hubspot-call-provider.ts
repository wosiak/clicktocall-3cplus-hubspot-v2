import CallingExtensions from "@hubspot/calling-extensions-sdk"

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
        console.log("[HubSpot] SDK ready")
        hubspotInstance?.initialized({})
      },
      onDialNumber: (payload: any) => {
        const number = payload?.toNumber || payload?.phoneNumber || payload?.number
        if (number != null) handlers.dial(String(number))
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
        console.log("[HubSpot] Event", ev)
      },
    },
  })

  ;(window as any).HubSpotConversations = hubspotInstance
  return hubspotInstance
}
