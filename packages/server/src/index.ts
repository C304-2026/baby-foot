import { WebSocketServer } from 'ws';
import { TICK_RATE } from '@babyfoot/shared';

// Jalon 1 : squelette. Salons, simulation autoritaire et netcode arrivent au jalon 3.
const PORT = Number(process.env.PORT ?? 2567);
const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    // Écho « ping » pour mesurer la latence côté client.
    if (data.toString() === 'ping') ws.send('pong');
  });
});

console.log(`[server] ws://localhost:${PORT} (simulation ${TICK_RATE} Hz)`);
