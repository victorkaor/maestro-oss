import {
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from "@maestro-oss/shared";

export interface DaemonSocket {
  send: (message: ClientMessage) => void;
  close: () => void;
}

export function connectDaemon(options: {
  token: string;
  workspaceId: string;
  onMessage: (message: ServerMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
}): DaemonSocket {
  const url = process.env.NEXT_PUBLIC_DAEMON_WS_URL ?? "ws://localhost:4200";
  const ws = new WebSocket(url);
  const queue: ClientMessage[] = [];
  let ready = false;

  const send = (message: ClientMessage): void => {
    if (ready) {
      ws.send(JSON.stringify(message));
    } else {
      queue.push(message);
    }
  };

  ws.addEventListener("open", () => {
    ready = true;
    send({ type: "auth", token: options.token, workspaceId: options.workspaceId });
    for (const msg of queue.splice(0)) ws.send(JSON.stringify(msg));
    options.onOpen?.();
  });

  ws.addEventListener("message", (event) => {
    try {
      const parsed = parseServerMessage(JSON.parse(String(event.data)));
      options.onMessage(parsed);
    } catch (err) {
      console.error("[daemon-socket] bad message from daemon", err);
    }
  });

  ws.addEventListener("close", () => {
    ready = false;
    options.onClose?.();
  });

  return {
    send,
    close: () => ws.close(),
  };
}
