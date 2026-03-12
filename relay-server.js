/**
 * CCTE Tracker — Relay Server
 *
 * Servidor ligero Socket.IO que retransmite telemetría en la red local.
 * El Maestro emite 'broadcast_telemetry' → el relay lo reenvía a todos
 * los Espectadores con 'telemetry_update'.
 *
 * Uso:
 *   node relay-server.js
 *
 * Requiere: npm install socket.io
 */

import { createServer } from 'http';
import { Server }        from 'socket.io';

const PORT = 3001;

// ── HTTP server ───────────────────────────────────────────────────────
const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

// ── Socket.IO ─────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 5_000,
  pingTimeout:  10_000,
});

// ── Estado del relay ──────────────────────────────────────────────────
let connectedClients = 0;
let masterSocketId   = null;
let packetsRelayed   = 0;

io.on('connection', (socket) => {
  connectedClients++;
  console.log(`[+] Cliente conectado   id=${socket.id}  total=${connectedClients}`);

  // ── Maestro → relay → espectadores ───────────────────────────────
  socket.on('broadcast_telemetry', (data) => {
    if (masterSocketId !== socket.id) {
      masterSocketId = socket.id;
      console.log(`[MAESTRO] Nuevo maestro: ${socket.id}`);
    }

    // Reenviar a todos EXCEPTO al emisor
    socket.broadcast.emit('telemetry_update', data);
    packetsRelayed++;

    if (packetsRelayed % 1_000 === 0) {
      console.log(`[RELAY] ${packetsRelayed} paquetes retransmitidos  clientes=${connectedClients}`);
    }
  });

  // ── Info de estado para espectadores ─────────────────────────────
  socket.on('who_is_master', () => {
    socket.emit('master_status', { masterSocketId, connectedClients });
  });

  socket.on('disconnect', (reason) => {
    connectedClients--;
    if (socket.id === masterSocketId) {
      masterSocketId = null;
      console.log(`[MAESTRO] Maestro desconectado (${reason}). Esperando nuevo maestro.`);
      io.emit('master_offline');
    }
    console.log(`[-] Cliente desconectado id=${socket.id}  reason=${reason}  total=${connectedClients}`);
  });
});

// ── Arranque ──────────────────────────────────────────────────────────
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 CCTE Relay Server  →  http://0.0.0.0:${PORT}`);
  console.log(`   Health check       →  http://localhost:${PORT}/health\n`);
});
