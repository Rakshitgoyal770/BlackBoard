"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { API_BASE, WS_BASE } from '../lib/config';
import { getToken } from '../lib/auth';
import { buildShape, drawScene, parseShape, type Shape, type Tool } from '../lib/whiteboard';
import { LiveKitRoom, ParticipantTile, RoomAudioRenderer, useRoomContext, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';

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

type JoinRoomNavState = {
  cameraOn?: boolean;
  micOn?: boolean;
};

function mergeShapes(current: Shape[], incoming: Shape[]) {
  const merged = [...current];
  const seen = new Set(current.map((shape) => JSON.stringify(shape)));

  incoming.forEach((shape) => {
    const key = JSON.stringify(shape);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(shape);
  });

  return merged;
}

// Compact horizontal video strip sitting alongside the whiteboard,
// instead of LiveKit's default full-screen VideoConference layout.
function VideoStrip() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  if (tracks.length === 0) {
    return <div className="video-strip-empty">Waiting for participants...</div>;
  }

  return (
    <div className="video-strip">
      {tracks.map((track) => (
        <div className="video-tile" key={track.participant.identity + track.source}>
          <ParticipantTile trackRef={track} />
          <div className="participant-status" aria-label="Participant status">
            <span className={`participant-status-chip ${track.participant.isMicrophoneEnabled ? 'on' : 'off'}`}>
              {track.participant.isMicrophoneEnabled ? 'Mic on' : 'Mic off'}
            </span>
            <span className={`participant-status-chip ${track.participant.isCameraEnabled ? 'on' : 'off'}`}>
              {track.participant.isCameraEnabled ? 'Camera on' : 'Camera off'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function LiveKitMediaSync({ cameraOn, micOn }: { cameraOn: boolean; micOn: boolean }) {
  const room = useRoomContext();

  useEffect(() => {
    void room.localParticipant.setCameraEnabled(cameraOn).catch(() => {
      // The room UI already reflects the requested state; keep the tile usable if the device call fails.
    });
  }, [cameraOn, room]);

  useEffect(() => {
    void room.localParticipant.setMicrophoneEnabled(micOn).catch(() => {
      // Keep the UI responsive even if microphone changes fail.
    });
  }, [micOn, room]);

  return null;
}

export default function ChatRoom() {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomId: roomIdParam } = useParams();
  const roomId = Number(roomIdParam);
  const token = getToken();

  const navState = (location.state ?? {}) as JoinRoomNavState;
  const initialCameraOn = navState.cameraOn ?? true;
  const initialMicOn = navState.micOn ?? true;

  const socketRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const toolRef = useRef<Tool>('rectangle');
  const shapesRef = useRef<Shape[]>([]);
  const draftShapeRef = useRef<Shape | null>(null);
  const pendingShapesRef = useRef<string[]>([]);
  const drawStateRef = useRef({ drawing: false, startX: 0, startY: 0 });

  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [status, setStatus] = useState('Connecting you to the board...');
  const [loading, setLoading] = useState(true);
  const [selectedTool, setSelectedTool] = useState<Tool>('rectangle');
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [videoToken, setVideoToken] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [cameraOn, setCameraOn] = useState(initialCameraOn);
  const [micOn, setMicOn] = useState(initialMicOn);
  const [speakerOn, setSpeakerOn] = useState(true);
  const undoStack = useRef<Shape[][]>([]);
  const redoStack = useRef<Shape[][]>([]);

  const cameraRef = useRef({
    x: 0,
    y: 0,
    zoom: 1,
});


  const roomLabel = useMemo(() => {
    if (room?.slug) return room.slug;
    if (Number.isInteger(roomId)) return `Room ${roomId}`;
    return 'Room';
  }, [room?.slug, roomId]);

  useEffect(() => {
    toolRef.current = selectedTool;
  }, [selectedTool]);

  useEffect(() => {
    shapesRef.current = shapes;
  }, [shapes]);

  // Load room metadata + saved whiteboard history
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
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/rooms/${roomId}/messages`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!roomRes.ok) throw new Error((await roomRes.text()) || 'Unable to load room.');
        if (!messagesRes.ok) throw new Error((await messagesRes.text()) || 'Unable to load room history.');

        const roomPayload = (await roomRes.json()) as RoomInfo;
        const messagesPayload = (await messagesRes.json()) as StoredMessage[];
        const parsedShapes = messagesPayload
          .map((entry) => parseShape(entry.message))
          .filter((shape): shape is Shape => shape !== null);

        if (!isActive) return;

        const mergedShapes = mergeShapes(shapesRef.current, parsedShapes);
        setRoom(roomPayload);
        setShapes(mergedShapes);
        shapesRef.current = mergedShapes;
        setStatus('');
      } catch (error) {
        if (!isActive) return;
        setStatus(error instanceof Error ? error.message : 'Unable to load this board.');
      } finally {
        if (isActive) setLoading(false);
      }
    }

    void loadRoomData();
    return () => {
      isActive = false;
    };
  }, [navigate, roomId, token]);

  // Fetch LiveKit video token
  useEffect(() => {
    if (!token || !Number.isInteger(roomId)) return;

    let isActive = true;
    setVideoStatus('loading');

    async function fetchVideoToken() {
      try {
        const res = await fetch(`${API_BASE}/video-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ roomId }),
        });

        const text = await res.text();
        if (!res.ok) throw new Error(text || 'Unable to start video calling.');

        const data = JSON.parse(text) as { token?: string; url?: string };
        if (!data.token || !data.url) throw new Error('LiveKit token response was incomplete.');

        if (!isActive) return;
        setVideoToken(data.token);
        setVideoUrl(data.url);
        setVideoStatus('ready');
      } catch (error) {
        if (!isActive) return;
        setVideoToken(null);
        setVideoUrl(null);
        setVideoStatus('error');
        setStatus(error instanceof Error ? error.message : 'Unable to start video calling.');
      }
    }

    void fetchVideoToken();
    return () => {
      isActive = false;
    };
  }, [roomId, token]);

  // Whiteboard realtime sync over WebSocket
  useEffect(() => {
    if (!token || !Number.isInteger(roomId)) return;

    const socket = new WebSocket(`${WS_BASE}?token=${encodeURIComponent(token)}`);
    socketRef.current = socket;

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'join_room', roomId }));
    });

    socket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data) as SocketMessage;
        if (data.type !== 'chat' || data.roomId !== roomId || !data.message) return;

        const incomingShape = parseShape(data.message);
        if (!incomingShape) return;

        if (pendingShapesRef.current[0] === data.message) {
          pendingShapesRef.current.shift();
          return;
        }

        const nextShapes = mergeShapes(shapesRef.current, [incomingShape]);
        shapesRef.current = nextShapes;
        setShapes(nextShapes);
      } catch {
        // ignore malformed payloads
      }
    });

    socket.addEventListener('close', () => {
      setStatus((current) =>
        current.includes('Unable') ? current : 'Board disconnected. Refresh or rejoin if sync stops.'
      );
    });

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'leave_room', roomId }));
      }
      socket.close();
      socketRef.current = null;
    };
  }, [roomId, token]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    drawScene(
        canvas,
        context,
        shapes,
        cameraRef.current,
        draftShapeRef.current
    );

}, [shapes]);

  function getCanvasCoordinates(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const worldX = ((event.clientX - rect.left) * scaleX - cameraRef.current.x) / cameraRef.current.zoom;

    const worldY = ((event.clientY - rect.top) * scaleY - cameraRef.current.y) / cameraRef.current.zoom;
    return {
       x: worldX,
       y: worldY,
    };
  }

  function saveHistory() {
    undoStack.current.push(
        shapesRef.current.map(shape => structuredClone(shape))
    );

    redoStack.current = [];
}
  
function handleWheel(event: ReactWheelEvent<HTMLCanvasElement>) {
    event.preventDefault();

    if (event.deltaY < 0) {
        cameraRef.current.zoom *= 1.1;
    } else {
        cameraRef.current.zoom /= 1.1;
    }

    console.log(cameraRef.current.zoom);

    redrawBoard();
}

function redrawBoard(previewShape?: Shape | null) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    drawScene(
        canvas,
        context,
        shapesRef.current,
        cameraRef.current,
        previewShape
    );
}

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const coordinates = getCanvasCoordinates(event);
    if (!coordinates) return;
    drawStateRef.current = { drawing: true, startX: coordinates.x, startY: coordinates.y };
    if (toolRef.current === "pencil") {
        draftShapeRef.current = {
            type: "pencil",
            points: [
                {
                    x: coordinates.x,
                    y: coordinates.y,
                },
            ],
        };
    }

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawStateRef.current.drawing) return;
    const coordinates = getCanvasCoordinates(event);
    if (!coordinates) return;

    if (toolRef.current === "pencil") {

        const pencil = draftShapeRef.current;

        if (pencil && pencil.type === "pencil") {

            pencil.points.push({
                x: coordinates.x,
                y: coordinates.y,
            });

            redrawBoard(pencil);
        }

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

  function finishDrawing(event: ReactPointerEvent<HTMLCanvasElement>, shouldCommit: boolean) {
    if (!drawStateRef.current.drawing) return;
    const coordinates = getCanvasCoordinates(event);
    drawStateRef.current.drawing = false;
    event.currentTarget.releasePointerCapture(event.pointerId);

    if (!coordinates || !shouldCommit) {
      draftShapeRef.current = null;
      redrawBoard(null);
      return;
    }

    let nextShape: Shape;

if (toolRef.current === "pencil") {

    if (
        !draftShapeRef.current ||
        draftShapeRef.current.type !== "pencil"
    ) {
        return;
    }

    nextShape = draftShapeRef.current;

} else {

  saveHistory();


    nextShape = buildShape(
        toolRef.current,
        drawStateRef.current.startX,
        drawStateRef.current.startY,
        coordinates.x,
        coordinates.y
    );

}
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
    socket.send(JSON.stringify({ type: 'chat', roomId, message: serializedShape }));
    setStatus('Shape synced to the board.');
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    finishDrawing(event, true);
  }

  function handlePointerLeave(event: ReactPointerEvent<HTMLCanvasElement>) {
    finishDrawing(event, false);
  }

  function handleLeaveRoom() {
    navigate('/join-room', { replace: true });
  }

  function undo() {

    if (undoStack.current.length === 0) {
        return;
    }

    redoStack.current.push(
        structuredClone(shapesRef.current)
    );

    const previous =
        undoStack.current.pop()!;

    shapesRef.current = previous;
    setShapes(previous);

    redrawBoard();
}

function redo() {

    if (redoStack.current.length === 0) {
        return;
    }

    undoStack.current.push(
        structuredClone(shapesRef.current)
    );

    const next =
        redoStack.current.pop()!;

    shapesRef.current = next;
    setShapes(next);

    redrawBoard();
}

useEffect(() => {

    function handleKeyDown(event: KeyboardEvent) {

        if (event.ctrlKey && event.key === "z") {
            event.preventDefault();
            undo();
        }

        if (
            event.ctrlKey &&
            (event.key === "y" ||
             (event.shiftKey && event.key === "Z"))
        ) {
            event.preventDefault();
            redo();
        }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () =>
        window.removeEventListener(
            "keydown",
            handleKeyDown
        );

}, []);


  return (
    <main className="board-shell">
      <section className="board-layout">

        <section className="board-panel">

          {/* Compact video strip, always visible above the whiteboard,
              never taking over the whole screen */}
          <div className="video-wrap">
            {videoStatus === 'loading' && <div className="video-placeholder">Preparing video room...</div>}
            {videoStatus === 'error' && (
              <div className="video-placeholder error">
                Video could not start. Check the LiveKit URL, API key, and camera permissions.
              </div>
            )}
            {videoToken && videoUrl && (
              <LiveKitRoom
                token={videoToken}
                serverUrl={videoUrl}
                connect={true}
                video={cameraOn}
                audio={micOn}
                onError={() => setVideoStatus('error')}
                onConnected={() => setVideoStatus('ready')}
                onDisconnected={() => setVideoStatus('error')}
              >
                <RoomAudioRenderer muted={!speakerOn} />
                <LiveKitMediaSync cameraOn={cameraOn} micOn={micOn} />
                <VideoStrip />
              </LiveKitRoom>
            )}
          </div>

          {/* The dominant shared canvas — the actual centerpiece of the room */}
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
                onWheel={handleWheel}
            />
            </div>
          )}

          <div className="room-floating-info">
            <span>{roomLabel}</span>
            <strong>Room #{Number.isInteger(roomId) ? roomId : 'Unknown'}</strong>
          </div>

          {status && (
            <div className="room-status" role="status" aria-live="polite">
              {status}
            </div>
          )}

          <div className="board-floating-panel" aria-label="Board controls">
            <div className="dock-group">
              <span className="dock-label">Shapes</span>
              <button
                className={`dock-button ${selectedTool === 'rectangle' ? 'active' : ''}`}
                type="button"
                onClick={() => setSelectedTool('rectangle')}
                aria-label="Rectangle tool"
                title="Rectangle"
              >
                <span aria-hidden="true">▭</span>
              </button>
              <button
                className={`dock-button ${selectedTool === 'circle' ? 'active' : ''}`}
                type="button"
                onClick={() => setSelectedTool('circle')}
                aria-label="Circle tool"
                title="Circle"
              >
                <span aria-hidden="true">◯</span>
              </button>
              <button
                className={`dock-button ${selectedTool === 'line' ? 'active' : ''}`}
                type="button"
                onClick={() => setSelectedTool('line')}
                aria-label="Line tool"
                title="Line"
              >
              <span aria-hidden="true">／</span>
              </button>
              <button
                className={`dock-button ${selectedTool === 'pencil' ? 'active' : ''}`}
                type="button"
                onClick={() => setSelectedTool('pencil')}
                aria-label="pencil tool"
                title="Line"
              >
              <span aria-hidden="true">P</span>
              </button>
            </div>

            <div>
              <button
                  className="dock-button"
                  onClick={undo}
                  title="Undo"
              >
                  ↶
              </button>

              <button
                  className="dock-button"
                  onClick={redo}
                  title="Redo"
              >
                  ↷
              </button>
            </div>

            <div className="dock-group">
              <span className="dock-label">Media</span>
              <button
                className={`dock-button ${cameraOn ? 'active' : ''}`}
                type="button"
                onClick={() => setCameraOn((prev) => !prev)}
                aria-label={cameraOn ? 'Camera on' : 'Camera off'}
                title={cameraOn ? 'Camera on' : 'Camera off'}
              >
                <span aria-hidden="true">🎥</span>
              </button>
              <button
                className={`dock-button ${micOn ? 'active' : ''}`}
                type="button"
                onClick={() => setMicOn((prev) => !prev)}
                aria-label={micOn ? 'Microphone on' : 'Microphone off'}
                title={micOn ? 'Microphone on' : 'Microphone off'}
              >
                <span aria-hidden="true">🎤</span>
              </button>
              <button
                className={`dock-button ${speakerOn ? 'active' : ''}`}
                type="button"
                onClick={() => setSpeakerOn((prev) => !prev)}
                aria-label={speakerOn ? 'Sound on' : 'Sound off'}
                title={speakerOn ? 'Sound on' : 'Sound off'}
              >
                <span aria-hidden="true">🔊</span>
              </button>
            </div>

            <div className="dock-group dock-actions">
              <Link to="/join-room" className="dock-link">
                Change room
              </Link>
              <button className="dock-leave" type="button" onClick={handleLeaveRoom}>
                Leave
              </button>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}