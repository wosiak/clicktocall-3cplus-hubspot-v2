## 📋 Lista de Tarefas

### 1. Criar nova rota `/extension`
- [x] Criar `app/extension/page.tsx`
- [x] Implementar interface de conexão SIP/WebRTC
- [x] Solicitar permissões de microfone
- [x] Conectar ao WebSocket da 3C Plus (`wss://socket.3c.plus`)

### 2. Implementar BroadcastChannel no `/extension`
- [x] Canal `extension-status` para sincronizar estado
- [x] Enviar `EXTENSION_OPENED` ao abrir
- [x] Enviar `EXTENSION_CONNECTED` ao conectar SIP
- [x] Enviar `EXTENSION_CLOSED` ao fechar
- [x] Responder a `CHECK_EXTENSION_STATUS`

### 3. Implementar heartbeat no `/extension`
- [x] Canal `extension-heartbeat`
- [x] Escutar mensagens `CLICKTOCALL_ALIVE`
- [x] Timer verificando último heartbeat (5s timeout)
- [x] Auto-fechar popup se nenhuma aba ativa

### 4. Atualizar `click-to-call-system.tsx`
- [x] Mudar URL de `https://app.3c.plus/extension` para `/extension`
- [x] Adicionar BroadcastChannel `extension-status`
- [x] Escutar eventos do popup (opened, connected, closed)
- [x] Enviar `CHECK_EXTENSION_STATUS` ao inicializar/após F5
- [x] Prevenir abertura de popup duplicado via channel

### 5. Implementar heartbeat no ClickToCall
- [x] Canal `extension-heartbeat`
- [x] Interval enviando `CLICKTOCALL_ALIVE` a cada 2s
- [x] Cleanup ao desmontar componente

### 6. Remover código obsoleto
- [x] Remover lógica de `localStorage` para controle de popup (`3c_extension_window_name`)
- [x] Simplificar função `getExtensionWindowReference`
- [x] Reabilitar validações comentadas (bugs corrigidos)

### 7. Testar cenários
- [ ] Múltiplas abas sem duplicar popup
- [ ] F5 em qualquer aba (deve reconectar sem novo popup)
- [ ] Fechar abas uma por uma (popup fecha apenas na última)
- [ ] Popup bloqueado pelo navegador
- [ ] Perda de conexão WebSocket

---

## ✅ Implementação Completa!

Todas as tarefas de desenvolvimento foram concluídas com sucesso:
- ✅ Nova rota `/extension` criada e funcionando
- ✅ Sistema de BroadcastChannel implementado
- ✅ Heartbeat automático configurado
- ✅ Código obsoleto removido
- ✅ Build passando sem erros

**Próximo passo**: Testar em ambiente de desenvolvimento com `pnpm dev`

Veja o arquivo `03_Resumo_Implementacao.md` para detalhes completos.