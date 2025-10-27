#!/bin/bash

# Script para testar comunicação Socket.IO
echo "🔧 Testando comunicação Socket.IO..."
echo ""

# Verificar se os containers estão rodando
if ! docker-compose ps | grep -q "Up"; then
    echo "❌ Containers não estão rodando. Execute: docker-compose up -d"
    exit 1
fi

echo "✅ Containers estão rodando"
echo ""

# Testar HTTPS
echo "🔒 Testando HTTPS..."
if curl -k -s https://localhost/api/health | grep -q "healthy"; then
    echo "✅ HTTPS funcionando"
else
    echo "❌ HTTPS não está funcionando"
    exit 1
fi

echo ""
echo "🌐 Acesse o teste manual em:"
echo "   https://localhost/test-socket-communication.html"
echo ""
echo "📋 Instruções:"
echo "   1. Abra o link acima no navegador"
echo "   2. Aceite o certificado SSL auto-assinado"
echo "   3. Clique em 'Conectar'"
echo "   4. Teste os eventos Socket.IO"
echo ""
echo "📊 Para ver logs em tempo real:"
echo "   docker-compose logs -f clicktocall-app"
echo ""
echo "🔍 Para ver logs do nginx:"
echo "   docker-compose logs -f nginx"
