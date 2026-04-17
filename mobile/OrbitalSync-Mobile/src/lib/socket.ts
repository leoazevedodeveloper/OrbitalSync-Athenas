import { io, Socket } from 'socket.io-client';
import { BACKEND_ORIGIN, SOCKET_OPTIONS, DEBUG_MOBILE_LOGS } from '../constants/config';

let socket: Socket | null = null;

function logSocket(message: string, payload?: unknown) {
  if (!DEBUG_MOBILE_LOGS) return;
  if (payload === undefined) {
    console.log(`[OrbitalSync][socket] ${message}`);
    return;
  }
  console.log(`[OrbitalSync][socket] ${message}`, payload);
}

export function getSocket(): Socket {
  if (!socket) {
    logSocket(`connecting to ${BACKEND_ORIGIN}`);
    socket = io(BACKEND_ORIGIN, SOCKET_OPTIONS);

    socket.on('connect', () => {
      logSocket(`connected id=${socket?.id ?? 'unknown'}`);
    });

    socket.on('disconnect', (reason) => {
      logSocket(`disconnected reason=${reason}`);
    });

    socket.on('connect_error', (error) => {
      logSocket('connect_error', error?.message ?? error);
    });

    socket.onAny((event, ...args) => {
      logSocket(`<-${event}`, args[0]);
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    logSocket('manual disconnect');
    socket.disconnect();
    socket = null;
  }
}
