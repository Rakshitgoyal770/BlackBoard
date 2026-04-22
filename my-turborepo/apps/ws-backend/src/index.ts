import type { IncomingMessage } from "http";
import jwt from "jsonwebtoken";
import { prisma } from "@repo/db";
import { WebSocket, WebSocketServer } from "ws";

const JWT_SECRET = process.env.JWT_SECRET ?? "hi";
const wss = new WebSocketServer({ port: 8080 });

console.log("WebSocket server is running on port 8080");

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
        currentUser.rooms.push(roomId);
      }

      return;
    }

    if (parsedData.type === "leave_room") {
      const roomId = Number(parsedData.roomId);

      if (!Number.isFinite(roomId)) {
        return;
      }

      currentUser.rooms = currentUser.rooms.filter((room) => room !== roomId);
      return;
    }

    if (parsedData.type === "chat") {
      const roomId = Number(parsedData.roomId);
      const message = parsedData.message;

      if (!Number.isFinite(roomId) || !message) {
        return;
      }

      await prisma.chat.create({
        data: {
          roomId,
          userId,
          message,
        },
      });

      users.forEach((user) => {
        if (user.rooms.includes(roomId) && user.ws.readyState === WebSocket.OPEN) {
          user.ws.send(
            JSON.stringify({
              type: "chat",
              roomId,
              message,
            }),
          );
        }
      });
    }
  });

  ws.on("close", () => {
    const index = users.findIndex((user) => user.ws === ws);
    if (index !== -1) {
      users.splice(index, 1);
    }
  });
});
