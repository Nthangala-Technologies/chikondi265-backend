import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { hashSessionToken } from "../auth/security";
import { resolveSession } from "../auth/service";
import { assertChatAccess, type SerializedConnectionMessage } from "./service";

const rooms = new Map<string, Set<WebSocket>>();
const socketUsers = new WeakMap<WebSocket, string>();
const roomTimers = new Map<string, NodeJS.Timeout>();
const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 });
const sessionTokenPattern = /^[A-Za-z0-9_-]{43}$/;

function rejectUpgrade(
  socket: Duplex,
  statusCode: 401 | 403,
  code: "UNAUTHENTICATED" | "FORBIDDEN",
  message: string,
): void {
  const statusText = statusCode === 401 ? "Unauthorized" : "Forbidden";
  const body = JSON.stringify({ error: { code, message } });
  socket.end(
    `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
      "Connection: close\r\n" +
      "Content-Type: application/json; charset=utf-8\r\n" +
      `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n` +
      body,
  );
}

function removeSocket(connectionId: string, socket: WebSocket): void {
  const room = rooms.get(connectionId);
  room?.delete(socket);
  if (room?.size) return;

  rooms.delete(connectionId);
  const timer = roomTimers.get(connectionId);
  if (timer) clearInterval(timer);
  roomTimers.delete(connectionId);
}

function addSocket(connectionId: string, userId: string, socket: WebSocket): void {
  const room = rooms.get(connectionId) ?? new Set<WebSocket>();
  room.add(socket);
  rooms.set(connectionId, room);
  socketUsers.set(socket, userId);

  if (!roomTimers.has(connectionId)) {
    const timer = setInterval(() => {
      const firstSocket = rooms.get(connectionId)?.values().next().value as
        | WebSocket
        | undefined;
      if (!firstSocket || firstSocket.readyState !== WebSocket.OPEN) return;
      const firstUserId = socketUsers.get(firstSocket);
      if (!firstUserId) return;

      void assertChatAccess(firstUserId, connectionId).catch(() => {
        for (const member of rooms.get(connectionId) ?? []) {
          member.close(4403, "Chat access was revoked");
        }
      });
    }, 15_000);
    timer.unref();
    roomTimers.set(connectionId, timer);
  }

  socket.on("message", (data) => {
    if (data.toString() === "ping") {
      socket.send(JSON.stringify({ type: "pong" }));
      return;
    }
    socket.close(1008, "Send messages through the authenticated API");
  });
  socket.on("close", () => removeSocket(connectionId, socket));
  socket.on("error", () => removeSocket(connectionId, socket));
  socket.send(JSON.stringify({ type: "ready", connectionId }));
}

async function authenticateUpgrade(
  request: IncomingMessage,
  socket: Duplex,
): Promise<{ connectionId: string; userId: string } | null> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (url.pathname !== "/ws") return null;

  const token = url.searchParams.get("token");
  const connectionId = url.searchParams.get("connectionId");
  if (
    !token ||
    !sessionTokenPattern.test(token) ||
    !connectionId ||
    !/^[0-9a-f-]{36}$/i.test(connectionId)
  ) {
    rejectUpgrade(
      socket,
      401,
      "UNAUTHENTICATED",
      "A valid session token and connection ID are required.",
    );
    return null;
  }

  const session = await resolveSession(hashSessionToken(token));
  if (!session || session.status !== "active" || session.deletedAt) {
    rejectUpgrade(socket, 401, "UNAUTHENTICATED", "A valid session is required.");
    return null;
  }

  try {
    await assertChatAccess(session.userId, connectionId);
  } catch {
    rejectUpgrade(socket, 403, "FORBIDDEN", "Chat is unavailable.");
    return null;
  }

  return { connectionId, userId: session.userId };
}

export function attachChatWebSocket(server: Server): void {
  server.on("upgrade", (request, socket, head) => {
    void authenticateUpgrade(request, socket)
      .then((auth) => {
        if (!auth) {
          return;
        }

        websocketServer.handleUpgrade(request, socket, head, (client) => {
          addSocket(auth.connectionId, auth.userId, client);
        });
      })
      .catch(() => {
        if (!socket.destroyed) {
          rejectUpgrade(
            socket,
            403,
            "FORBIDDEN",
            "Chat is unavailable.",
          );
        }
      });
  });
}

export function publishConnectionMessage(
  connectionId: string,
  message: SerializedConnectionMessage,
): void {
  const payload = JSON.stringify({ type: "message", message });
  for (const socket of rooms.get(connectionId) ?? []) {
    if (socket.readyState === WebSocket.OPEN) socket.send(payload);
  }
}

export function publishConnectionClosed(connectionId: string): void {
  for (const socket of rooms.get(connectionId) ?? []) {
    socket.close(4403, "Connection is closed");
  }
}
