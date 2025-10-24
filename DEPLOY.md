# Click-to-Call 3C Plus HubSpot - Docker Deployment

Este documento descreve como fazer deploy da aplicação Click-to-Call usando Docker.

## 🏗️ Arquitetura

A aplicação agora roda com:
- **Servidor Node.js** com Express + Socket.IO
- **Next.js** como framework frontend
- **Socket.IO** para comunicação em tempo real (substituindo BroadcastChannel)
- **Docker** para containerização
- **Nginx** como reverse proxy (opcional)

## 📋 Pré-requisitos

- Docker
- Docker Compose
- Node.js 18+ (para desenvolvimento local)

## 🚀 Deploy Rápido

### 1. Deploy com Docker Compose (Recomendado)

```bash
# Clone o repositório
git clone <repository-url>
cd clicktocall-3cplus-hubspot-v2

# Execute o script de build e deploy
./build-and-deploy.sh

# Ou manualmente:
docker-compose up -d
```

### 2. Deploy Manual

```bash
# Build da imagem
docker build -t clicktocall-3cplus-hubspot .

# Executar container
docker run -p 3000:3000 clicktocall-3cplus-hubspot
```

## 🔧 Configuração

### Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
```

### Portas

- **3000**: Aplicação principal (Next.js + Socket.IO)
- **80**: Nginx (se habilitado)
- **443**: HTTPS (se configurado)

## 📊 Monitoramento

### Logs

```bash
# Ver logs de todos os serviços
docker-compose logs -f

# Ver logs de um serviço específico
docker-compose logs -f clicktocall-app
```

### Status dos Serviços

```bash
# Verificar status
docker-compose ps

# Health check
curl http://localhost:3000/health
```

## 🔄 Comandos Úteis

### Desenvolvimento

```bash
# Desenvolvimento local
npm run dev:server

# Build local
npm run build
npm run start:server
```

### Docker

```bash
# Build
npm run docker:build

# Executar
npm run docker:run

# Docker Compose
npm run docker:compose:up
npm run docker:compose:down
npm run docker:compose:logs
```

### Limpeza

```bash
# Parar serviços
docker-compose down

# Limpar volumes e imagens
docker-compose down -v
docker system prune -f

# Deploy limpo
./build-and-deploy.sh --clean
```

## 🌐 Acesso

Após o deploy, a aplicação estará disponível em:

- **Aplicação principal**: http://localhost:3000
- **Com Nginx**: http://localhost:80
- **Extensão**: http://localhost:3000/extension

## 🔧 Troubleshooting

### Problemas Comuns

1. **Porta já em uso**
   ```bash
   # Verificar processos na porta 3000
   lsof -i :3000
   
   # Matar processo
   kill -9 <PID>
   ```

2. **Erro de permissão Docker**
   ```bash
   # Adicionar usuário ao grupo docker
   sudo usermod -aG docker $USER
   # Fazer logout e login novamente
   ```

3. **Container não inicia**
   ```bash
   # Verificar logs
   docker-compose logs clicktocall-app
   
   # Rebuild
   docker-compose build --no-cache
   ```

### Logs Importantes

- **Socket.IO**: Conexões e eventos em tempo real
- **Next.js**: Erros de build e runtime
- **Nginx**: Requests e erros de proxy

## 🔒 Segurança

### Headers de Segurança

O Nginx está configurado com:
- X-Frame-Options
- X-XSS-Protection
- X-Content-Type-Options
- Content-Security-Policy

### Rate Limiting

- API: 10 requests/segundo
- Login: 5 requests/minuto

## 📈 Performance

### Otimizações

- **Gzip**: Compressão automática
- **Cache**: Arquivos estáticos com cache de 1 ano
- **Socket.IO**: Transport otimizado (websocket + polling)

### Monitoramento

```bash
# Uso de recursos
docker stats

# Logs de performance
docker-compose logs | grep -i "performance\|memory\|cpu"
```

## 🚀 Produção

### Configuração HTTPS

1. Adicione certificados SSL em `./ssl/`
2. Configure o Nginx para HTTPS
3. Atualize as variáveis de ambiente

### Load Balancer

Para múltiplas instâncias:

```yaml
# docker-compose.override.yml
version: '3.8'
services:
  clicktocall-app:
    deploy:
      replicas: 3
```

## 📞 Suporte

Para problemas ou dúvidas:

1. Verifique os logs: `docker-compose logs -f`
2. Consulte este documento
3. Abra uma issue no repositório

---

**Nota**: Esta aplicação substitui o sistema de BroadcastChannel por Socket.IO, permitindo comunicação em tempo real entre diferentes abas e a extensão, com melhor escalabilidade e confiabilidade.
