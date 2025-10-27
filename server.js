const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const next = require('next');
const path = require('path');
const fs = require('fs');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// Initialize Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Socket.IO rooms management
const rooms = new Map(); // token -> Set of socket IDs

app.prepare().then(() => {
  const server = createServer();
  const io = new Server(server, {
    cors: {
      origin: true, // Aceitar qualquer origem em desenvolvimento
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    path: '/socket.io/'
  });

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Join room based on token
    socket.on('join-room', (data) => {
      const { token } = data;
      if (!token) {
        socket.emit('error', { message: 'Token is required' });
        return;
      }

      const roomName = `token-${token}`;
      socket.join(roomName);
      
      // Track socket in room
      if (!rooms.has(token)) {
        rooms.set(token, new Set());
      }
      rooms.get(token).add(socket.id);
      
      console.log(`📱 Socket ${socket.id} joined room: ${roomName}`);
      socket.emit('joined-room', { room: roomName, token });
      
      // Notify others in the room about new connection
      socket.to(roomName).emit('user-connected', { socketId: socket.id });
    });

    // Handle extension status events
    socket.on('extension-opened', (data) => {
      const { token } = data;
      const roomName = `token-${token}`;
      console.log(`📱 Extension opened for token: ${token} in room: ${roomName}`);
      socket.to(roomName).emit('extension-opened', data);
    });

    socket.on('extension-connected', (data) => {
      const { token } = data;
      const roomName = `token-${token}`;
      console.log(`✅ Extension connected for token: ${token}`);
      socket.to(roomName).emit('extension-connected', data);
    });

    socket.on('extension-closed', (data) => {
      const { token } = data;
      const roomName = `token-${token}`;
      console.log(`❌ Extension closed for token: ${token}`);
      socket.to(roomName).emit('extension-closed', data);
    });

    // Handle agent status events
    socket.on('agent-connected', (data) => {
      const { token } = data;
      const roomName = `token-${token}`;
      console.log(`🔗 Agent connected for token: ${token}`);
      socket.to(roomName).emit('agent-connected', data);
    });

    socket.on('agent-logged-out', (data) => {
      const { token } = data;
      const roomName = `token-${token}`;
      console.log(`🚪 Agent logged out for token: ${token}`);
      socket.to(roomName).emit('agent-logged-out', data);
    });

    socket.on('agent-logged-out-during-call', (data) => {
      const { token } = data;
      const roomName = `token-${token}`;
      console.log(`🚪 Agent logged out during call for token: ${token}`);
      socket.to(roomName).emit('agent-logged-out-during-call', data);
    });

    // Handle campaigns events
    socket.on('campaigns-loaded', (data) => {
      const { token, campaigns } = data;
      const roomName = `token-${token}`;
      console.log(`📋 Campaigns loaded for token: ${token}`);
      socket.to(roomName).emit('campaigns-loaded', data);
    });

    // Handle microphone events
    socket.on('microphone-muted', (data) => {
      const { token } = data;
      const roomName = `token-${token}`;
      console.log(`🔇 Microphone muted for token: ${token}`);
      socket.to(roomName).emit('microphone-muted', data);
    });

    socket.on('microphone-unmuted', (data) => {
      const { token } = data;
      const roomName = `token-${token}`;
      console.log(`🎤 Microphone unmuted for token: ${token}`);
      socket.to(roomName).emit('microphone-unmuted', data);
    });

    // Handle heartbeat
    socket.on('heartbeat', (data) => {
      const { token } = data;
      const roomName = `token-${token}`;
      console.log(`💓 Heartbeat received from ${socket.id} in room ${roomName}`);
      socket.to(roomName).emit('heartbeat', { socketId: socket.id, timestamp: Date.now() });
    });

    // Handle token validation
    socket.on('token-validation', (data) => {
      const { token } = data;
      const roomName = `token-${token}`;
      console.log(`🔐 Token validation for: ${token}`);
      socket.to(roomName).emit('token-validation', data);
    });

    // Handle extension status check
    socket.on('check-extension-status', (data) => {
      const { token } = data;
      const roomName = `token-${token}`;
      console.log(`🔍 Extension status check for token: ${token}`);
      socket.to(roomName).emit('check-extension-status', data);
    });

    socket.on('extension-status-response', (data) => {
      const { token } = data;
      const roomName = `token-${token}`;
      console.log(`📊 Extension status response for token: ${token}`);
      socket.to(roomName).emit('extension-status-response', data);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
      
      // Remove socket from all rooms
      for (const [token, socketIds] of rooms.entries()) {
        if (socketIds.has(socket.id)) {
          socketIds.delete(socket.id);
          if (socketIds.size === 0) {
            rooms.delete(token);
          }
          console.log(`📱 Socket ${socket.id} removed from token: ${token}`);
        }
      }
    });
  });

  // Express routes
  const expressApp = express();

  // Serve static files from Next.js
  expressApp.all('*', (req, res) => {
    return handle(req, res);
  });

  // Attach Express app to HTTP server
  server.on('request', expressApp);

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`🚀 Server ready on http://${hostname}:${port}`);
    console.log(`📡 Socket.IO server running on port ${port}`);
  });
});
