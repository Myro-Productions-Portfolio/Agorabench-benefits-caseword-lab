import { WS_EVENTS } from '@shared/constants';
import type { WsMessage } from '@shared/types';

type EventHandler = (data: unknown) => void;

let ws: WebSocket | null = null;
const handlers = new Map<string, Set<EventHandler>>();

export function connectWebSocket(): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}/ws`;
  ws = new WebSocket(url);

  ws.onmessage = (e) => {
    const msg: WsMessage = JSON.parse(e.data);
    if (msg.event === WS_EVENTS.HEARTBEAT) return;
    const fns = handlers.get(msg.event);
    if (fns) fns.forEach((fn) => fn(msg.data));
  };

  ws.onclose = () => {
    ws = null;
    setTimeout(connectWebSocket, 3000);
  };
}

export function onEvent(event: string, handler: EventHandler): () => void {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event)!.add(handler);
  return () => handlers.get(event)?.delete(handler);
}
