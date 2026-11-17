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
const connectionIdPattern = /^[0-9a-f-]{36}$/i;

type ChatSocketAuth = { connectionId: string; userId: string };

class ChatSocketAuthError extends Error {
  constructor(
    readonly code: "UNAUTHENTICATED" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
  }
}

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

async function authenticateCredentials(
  token: string | null,
  connectionId: string | null,
): Promise<ChatSocketAuth> {
  if (
    !token ||
    !sessionTokenPattern.test(token) ||
    !connectionId ||
    !connectionIdPattern.test(connectionId)
  ) {
    throw new ChatSocketAuthError(
      "UNAUTHENTICATED",
      "A valid session token and connection ID are required.",
    );
  }

  const session = await resolveSession(hashSessionToken(token));
  if (!session || session.status !== "active" || session.deletedAt) {
    throw new ChatSocketAuthError("UNAUTHENTICATED", "A valid session is required.");
  }

  try {
    await assertChatAccess(session.userId, connectionId);
  } catch {
    throw new ChatSocketAuthError("FORBIDDEN", "Chat is unavailable.");
  }

  return { connectionId, userId: session.userId };
}

async function authenticateUpgrade(
  request: IncomingMessage,
  socket: Duplex,
): Promise<ChatSocketAuth | "awaiting-message-auth" | null> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (url.pathname !== "/ws") return null;

  const token = url.searchParams.get("token");
  const connectionId = url.searchParams.get("connectionId");
  if (!token && !connectionId) {
    return "awaiting-message-auth";
  }

  try {
    return await authenticateCredentials(token, connectionId);
  } catch (error) {
    const authError =
      error instanceof ChatSocketAuthError
        ? error
        : new ChatSocketAuthError("FORBIDDEN", "Chat is unavailable.");
    rejectUpgrade(
      socket,
      authError.code === "UNAUTHENTICATED" ? 401 : 403,
      authError.code,
      authError.message,
    );
    return null;
  }
}

export function attachChatWebSocket(server: Server): void {
  server.on("upgrade", (request, socket, head) => {
    void authenticateUpgrade(request, socket)
      .then((auth) => {
        if (!auth) return;

        websocketServer.handleUpgrade(request, socket, head, (client) => {
          if (auth !== "awaiting-message-auth") {
            addSocket(auth.connectionId, auth.userId, client);
            return;
          }

          let authenticating = false;
          const authTimeout = setTimeout(() => client.close(4401, "Authentication timed out"), 5_000);
          authTimeout.unref();
          client.once("close", () => clearTimeout(authTimeout));
          client.on("message", (data) => {
            if (authenticating) return;
            authenticating = true;
            void (async () => {
              try {
                const frame = JSON.parse(data.toString()) as {
                  type?: unknown;
                  token?: unknown;
                  connectionId?: unknown;
                };
                if (
                  frame.type !== "auth" ||
                  typeof frame.token !== "string" ||
                  typeof frame.connectionId !== "string"
                ) {
                  client.close(1008, "Send a valid auth frame first");
                  return;
                }
                const verified = await authenticateCredentials(
                  frame.token,
                  frame.connectionId,
                );
                if (client.readyState !== WebSocket.OPEN) return;
                clearTimeout(authTimeout);
                addSocket(verified.connectionId, verified.userId, client);
              } catch (error) {
                const code =
                  error instanceof ChatSocketAuthError
                    ? error.code
                    : "UNAUTHENTICATED";
                client.close(
                  code === "UNAUTHENTICATED" ? 4401 : 4403,
                  code === "UNAUTHENTICATED"
                    ? "Authentication failed"
                    : "Chat is unavailable",
                );
              }
            })();
          });
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
