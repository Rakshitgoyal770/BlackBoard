import { createServer, type IncomingMessage } from "http";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import { prisma } from "@repo/db";
import { WebSocket, WebSocketServer } from "ws";

// Use the same JWT secret as the API in local development. Production
// deployments provide JWT_SECRET directly and are never overwritten.
const localApiEnvPath = fileURLToPath(new URL("../../backend/.env", import.meta.url));
if (!process.env.JWT_SECRET && existsSync(localApiEnvPath)) {
  process.loadEnvFile(localApiEnvPath);
}

const JWT_SECRET = process.env.JWT_SECRET ?? "hi";
const PORT = Number(process.env.PORT ?? 8080);

interface User {
  ws: WebSocket;
  userId: string;
  rooms: number[];
}

interface JwtUserPayload {
  userId?: string | number;
  UserId?: string | number;
}

const users: User[] = [];

function checkUser(token: string): string | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (typeof decoded === "string") {
      return null;
    }

    const payload = decoded as JwtUserPayload;
    const userId = payload.userId ?? payload.UserId;

    if (!userId) {
      return null;
    }

    return String(userId);
  } catch {
    return null;
  }
}

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("WebSocket server is running");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws: WebSocket, request: IncomingMessage) => {
  const requestUrl = request.url ?? "";
  const parsedUrl = new URL(requestUrl, "http://localhost");
  const token = parsedUrl.searchParams.get("token");

  if (!token) {
    ws.close();
    return;
  }

  const userId = checkUser(token);

  if (!userId) {
    ws.close();
    return;
  }

  // Keep a small in-memory record so we can track which rooms this socket has joined.
  const currentUser: User = {
    ws,
    userId,
    rooms: [],
  };

  users.push(currentUser);

  ws.on("message", async (data) => {
    let parsedData: {
      type?: string;
      roomId?: string | number;
      message?: string;
    };

    try {
      parsedData = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (parsedData.type === "join_room") {
      const roomId = Number(parsedData.roomId);

      if (!Number.isFinite(roomId)) {
        return;
      }

      if (!currentUser.rooms.includes(roomId)) {
        // Join is idempotent; only add the room once per connected socket.
        currentUser.rooms.push(roomId);
      }

      return;
    }

    if (parsedData.type === "leave_room") {
      const roomId = Number(parsedData.roomId);

      if (!Number.isFinite(roomId)) {
        return;
      }

      // Remove the room so future broadcasts skip this socket.
      currentUser.rooms = currentUser.rooms.filter((room) => room !== roomId);
      return;
    }

    if (parsedData.type === "chat") {
      const roomId = Number(parsedData.roomId);
      const message = parsedData.message;

      if (!Number.isFinite(roomId) || !message) {
        return;
      }

      // Persist the shape first so the room history stays consistent with realtime delivery.
      const chat = await prisma.chat.create({
        data: {
          roomId,
          userId,
          message,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              name: true,
            },
          },
        },
      });

      // Broadcast the saved payload only to sockets that have joined the room.
      users.forEach((user) => {
        if (user.rooms.includes(roomId) && user.ws.readyState === WebSocket.OPEN) {
          user.ws.send(
            JSON.stringify({
              type: "chat",
              roomId,
              id: chat.id,
              message,
              userId,
              username: chat.user.username,
              name: chat.user.name,
              createdAt: chat.createdAt,
            }),
          );
        }
      });
    }
  });

  ws.on("close", () => {
    // Drop disconnected sockets from the active user list to avoid stale broadcasts.
    const index = users.findIndex((user) => user.ws === ws);

    if (index !== -1) {
      users.splice(index, 1);
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`WebSocket server is running on port ${PORT}`);
});
