// Notifica o HubSpot que o processo de chamada foi completado
export function notifyCallCompleted(callData: CallData, engagementData?: any) {
  if (!hubspotInstance) {
    console.warn("[HubSpot] SDK not initialized for notifyCallCompleted")
    return
  }

  console.log("[HubSpot] notifyCallCompleted - START")
  console.log("[HubSpot]   >> Received callData:", JSON.stringify(callData, null, 2))
  console.log("[HubSpot]   >> Received engagementData:", JSON.stringify(engagementData, null, 2))
  console.log("[HubSpot]   >> Current engagementId (before use):", currentEngagementId)

  // 1. Determinar o hsCallStatus (Status da Chamada HubSpot)
  // Prioridade: engagementData.hsCallStatus (se passado explicitamente) > análise das notas > padrão COMPLETED
  let determinedHsCallStatus = engagementData?.hsCallStatus
  if (!determinedHsCallStatus) {
    if (engagementData?.notes?.toLowerCase().includes("não atendida")) {
      determinedHsCallStatus = "NO_ANSWER"
    } else if (engagementData?.notes?.toLowerCase().includes("sem qualificação")) {
      determinedHsCallStatus = "CANCELED" // Ou "BUSY" ou "FAILED" dependendo da semântica desejada
    } else {
      determinedHsCallStatus = "COMPLETED"
    }
  }
  console.log("[HubSpot]   >> Determined hsCallStatus:", determinedHsCallStatus)

  // 2. Montar o payload básico para callCompleted
  const completionPayload: any = {
    externalCallId: callData.id || callData.telephony_id,
    callEndTime: Date.now(),
    hsCallStatus: determinedHsCallStatus, // Este é o campo CRÍTICO
  }
  console.log("[HubSpot]   >> Base payload (before engagementId):", JSON.stringify(completionPayload, null, 2))

  // 3. Adicionar engagementId se já existir um engajamento criado
  if (currentEngagementId) {
    completionPayload.engagementId = currentEngagementId
    console.log("[HubSpot]   >> Added existing currentEngagementId to payload:", currentEngagementId)
  } else {
    // Se não houver currentEngagementId, o HubSpot tentará encontrar um engajamento existente
    // usando o externalCallId ou criará um novo se `createEngagement` foi true em `outgoingCall`.
    // No entanto, para `callCompleted`, geralmente se espera que um engagementId já exista.
    console.warn("[HubSpot]   >> currentEngagementId is null. HubSpot will try to match or create an engagement.")
  }

  // 4. Adicionar detalhes do corpo e assunto do engajamento se fornecidos
  // Estes são opcionais para callCompleted, mas bons para enriquecer o engajamento.
  if (engagementData && engagementData.notes) {
    completionPayload.body = engagementData.notes
    console.log("[HubSpot]   >> Added body to payload:", engagementData.notes)
  }
  if (engagementData && engagementData.subject) {
    completionPayload.subject = engagementData.subject
    console.log("[HubSpot]   >> Added subject to payload:", engagementData.subject)
  }
  
  // 5. Adicionar engagementProperties (opcional, mas pode ser útil)
  // O HubSpot pode preencher hs_call_body e hs_call_title automaticamente com base em body e subject.
  // Incluir hs_call_status aqui é uma boa prática para garantir consistência.
  completionPayload.engagementProperties = {
    hs_call_body: engagementData?.notes || completionPayload.body || "",
    hs_call_title: engagementData?.subject || completionPayload.subject || `Chamada para ${callData.phone}`,
    hs_call_status: determinedHsCallStatus, // Garante que o status esteja aqui também
    // Outras propriedades personalizadas podem ser adicionadas aqui, se necessário
    // ex: hs_call_disposition: engagementData?.qualification?.name (se aplicável)
  }
  console.log("[HubSpot]   >> Added engagementProperties to payload:", JSON.stringify(completionPayload.engagementProperties, null, 2))

  console.log("[HubSpot] notifyCallCompleted - FINAL PAYLOAD to be sent:", JSON.stringify(completionPayload, null, 2))
  
  try {
    hubspotInstance.callCompleted(completionPayload)
    console.log("[HubSpot]   >> hubspotInstance.callCompleted() SUCESSFULLY CALLED.")
  } catch (error) {
    console.error("[HubSpot]   >> ERROR calling hubspotInstance.callCompleted():", error)
  }
  
  // Reset do engagement ID após completar, para a próxima chamada
  currentEngagementId = null
  console.log("[HubSpot] notifyCallCompleted - END (currentEngagementId reset to null)")
}

// Função para obter a instância do HubSpot (para uso direto se necessário)
export function getHubspotInstance() {
  return hubspotInstance
}

// Função para obter o ID do engagement atual
export function getCurrentEngagementId() {
  return currentEngagementId
}


