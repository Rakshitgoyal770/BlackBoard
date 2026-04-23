import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { API_BASE, WS_BASE } from '../lib/config';
import { clearToken, getToken } from '../lib/auth';
import { buildShape, drawScene, parseShape, type Shape, type Tool } from '../lib/whiteboard';

type RoomInfo = {
  id: number;
  slug: string;
  createdAt: string;
  admin: {
    id: string;
    username: string | null;
    name: string;
  };
};

type StoredMessage = {
  id: number;
  message: string;
};

type SocketMessage = {
  type?: string;
  id?: number;
  roomId?: number;
  message?: string;
};

function mergeShapes(current: Shape[], incoming: Shape[]) {
  const merged = [...current];
  const seen = new Set(current.map((shape) => JSON.stringify(shape)));

  incoming.forEach((shape) => {
    const key = JSON.stringify(shape);

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    merged.push(shape);
  });

  return merged;
}

export default function ChatRoom() {
  const navigate = useNavigate();
  const { roomId: roomIdParam } = useParams();
  const roomId = Number(roomIdParam);
  const token = getToken();

  const socketRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const toolRef = useRef<Tool>('rectangle');
  const shapesRef = useRef<Shape[]>([]);
  const draftShapeRef = useRef<Shape | null>(null);
  const pendingShapesRef = useRef<string[]>([]);
  const drawStateRef = useRef({
    drawing: false,
    startX: 0,
    startY: 0,
  });

  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [status, setStatus] = useState('Connecting you to the board...');
  const [loading, setLoading] = useState(true);
  const [selectedTool, setSelectedTool] = useState<Tool>('rectangle');
  const [shapes, setShapes] = useState<Shape[]>([]);

  const roomLabel = useMemo(() => {
    if (room?.slug) {
      return room.slug;
    }

    if (Number.isInteger(roomId)) {
      return `Room ${roomId}`;
    }

    return 'Room';
  }, [room?.slug, roomId]);

  useEffect(() => {
    toolRef.current = selectedTool;
  }, [selectedTool]);

  useEffect(() => {
    shapesRef.current = shapes;
  }, [shapes]);

  useEffect(() => {
    if (!token) {
      navigate('/signin', { replace: true });
      return;
    }

    if (!Number.isInteger(roomId)) {
      setStatus('Room id is invalid.');
      setLoading(false);
      return;
    }

    let isActive = true;

    async function loadRoomData() {
      try {
        const [roomRes, messagesRes] = await Promise.all([
          fetch(`${API_BASE}/rooms/${roomId}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
          fetch(`${API_BASE}/rooms/${roomId}/messages`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
        ]);

        if (!roomRes.ok) {
          const text = await roomRes.text();
          throw new Error(text || 'Unable to load room.');
        }

        if (!messagesRes.ok) {
          const text = await messagesRes.text();
          throw new Error(text || 'Unable to load room history.');
        }

        const roomPayload = (await roomRes.json()) as RoomInfo;
        const messagesPayload = (await messagesRes.json()) as StoredMessage[];
        const parsedShapes = messagesPayload
          .map((entry) => parseShape(entry.message))
          .filter((shape): shape is Shape => shape !== null);

        if (!isActive) {
          return;
        }

        const mergedShapes = mergeShapes(shapesRef.current, parsedShapes);

        setRoom(roomPayload);
        setShapes(mergedShapes);
        shapesRef.current = mergedShapes;
        setStatus('Board ready. Draw and collaborate in real time.');
      } catch (error) {
        if (!isActive) {
          return;
        }

        setStatus(
          error instanceof Error ? error.message : 'Unable to load this board.'
        );
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    void loadRoomData();

    return () => {
      isActive = false;
    };
  }, [navigate, roomId, token]);

  useEffect(() => {
    if (!token || !Number.isInteger(roomId)) {
      return;
    }

    const socket = new WebSocket(`${WS_BASE}?token=${encodeURIComponent(token)}`);
    socketRef.current = socket;

    socket.addEventListener('open', () => {
      socket.send(
        JSON.stringify({
          type: 'join_room',
          roomId,
        })
      );
    });

    socket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data) as SocketMessage;

        if (data.type !== 'chat' || data.roomId !== roomId || !data.message) {
          return;
        }

        const incomingShape = parseShape(data.message);

        if (!incomingShape) {
          return;
        }

        if (pendingShapesRef.current[0] === data.message) {
          pendingShapesRef.current.shift();
          return;
        }

        const nextShapes = mergeShapes(shapesRef.current, [incomingShape]);
        shapesRef.current = nextShapes;
        setShapes(nextShapes);
      } catch {
        // Ignore malformed realtime payloads.
      }
    });

    socket.addEventListener('close', () => {
      setStatus((current) =>
        current.includes('Unable')
          ? current
          : 'Board disconnected. Refresh or rejoin if sync stops.'
      );
    });

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: 'leave_room',
            roomId,
          })
        );
      }

      socket.close();
      socketRef.current = null;
    };
  }, [roomId, token]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    drawScene(canvas, context, shapes, draftShapeRef.current);
  }, [shapes]);

  function getCanvasCoordinates(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;

    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function redrawBoard(previewShape?: Shape | null) {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    drawScene(canvas, context, shapesRef.current, previewShape);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const coordinates = getCanvasCoordinates(event);

    if (!coordinates) {
      return;
    }

    drawStateRef.current = {
      drawing: true,
      startX: coordinates.x,
      startY: coordinates.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawStateRef.current.drawing) {
      return;
    }

    const coordinates = getCanvasCoordinates(event);

    if (!coordinates) {
      return;
    }

    draftShapeRef.current = buildShape(
      toolRef.current,
      drawStateRef.current.startX,
      drawStateRef.current.startY,
      coordinates.x,
      coordinates.y
    );
    redrawBoard(draftShapeRef.current);
  }

  function finishDrawing(
    event: ReactPointerEvent<HTMLCanvasElement>,
    shouldCommit: boolean
  ) {
    if (!drawStateRef.current.drawing) {
      return;
    }

    const coordinates = getCanvasCoordinates(event);

    drawStateRef.current.drawing = false;
    event.currentTarget.releasePointerCapture(event.pointerId);

    if (!coordinates || !shouldCommit) {
      draftShapeRef.current = null;
      redrawBoard(null);
      return;
    }

    const nextShape = buildShape(
      toolRef.current,
      drawStateRef.current.startX,
      drawStateRef.current.startY,
      coordinates.x,
      coordinates.y
    );

    draftShapeRef.current = null;
    const nextShapes = mergeShapes(shapesRef.current, [nextShape]);
    shapesRef.current = nextShapes;
    setShapes(nextShapes);

    const socket = socketRef.current;
    const serializedShape = JSON.stringify(nextShape);

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setStatus('Shape drawn locally. Realtime sync is not ready yet.');
      return;
    }

    pendingShapesRef.current.push(serializedShape);
    socket.send(
      JSON.stringify({
        type: 'chat',
        roomId,
        message: serializedShape,
      })
    );

    setStatus('Shape synced to the board.');
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    finishDrawing(event, true);
  }

  function handlePointerLeave(event: ReactPointerEvent<HTMLCanvasElement>) {
    finishDrawing(event, false);
  }

  function handleLogout() {
    clearToken();
    navigate('/signin', { replace: true });
  }

  return (
    <main className="board-shell">
      <section className="board-layout">
        <aside className="board-sidebar">
          <p className="eyebrow">BlackBoard</p>
          <h1>{roomLabel}</h1>
          <p className="subtitle">
            Shared drawing room where everyone in the same room can sketch on one canvas.
          </p>

          <div className="room-meta">
            <div className="meta-card">
              <span>Room id</span>
              <strong>{Number.isInteger(roomId) ? roomId : 'Unknown'}</strong>
            </div>
            <div className="meta-card">
              <span>Admin</span>
              <strong>{room?.admin?.username ?? room?.admin?.name ?? 'Loading...'}</strong>
            </div>
            <div className="meta-card">
              <span>Saved shapes</span>
              <strong>{shapes.length}</strong>
            </div>
          </div>

          <div className="tool-list">
            <button
              className={`tool-button ${selectedTool === 'rectangle' ? 'active' : ''}`}
              type="button"
              onClick={() => setSelectedTool('rectangle')}
            >
              Rectangle
            </button>
            <button
              className={`tool-button ${selectedTool === 'circle' ? 'active' : ''}`}
              type="button"
              onClick={() => setSelectedTool('circle')}
            >
              Circle
            </button>
            <button
              className={`tool-button ${selectedTool === 'line' ? 'active' : ''}`}
              type="button"
              onClick={() => setSelectedTool('line')}
            >
              Line
            </button>
          </div>

          <div className="sidebar-actions">
            <Link to="/join-room" className="btn btn-ghost">
              Change room
            </Link>
            <button className="btn btn-primary" type="button" onClick={handleLogout}>
              Sign out
            </button>
          </div>

          <p className="status-line">{status}</p>
        </aside>

        <section className="board-panel">
          <header className="board-header">
            <div>
              <p className="eyebrow">Canvas board</p>
              <h2>{roomLabel}</h2>
            </div>
            <span className="message-count">
              Tool: {selectedTool}
            </span>
          </header>

          {loading ? (
            <div className="board-empty">Loading board and existing drawings...</div>
          ) : (
            <div className="canvas-wrap">
              <canvas
                ref={canvasRef}
                className="board-canvas"
                width={1280}
                height={760}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerLeave}
              />
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
