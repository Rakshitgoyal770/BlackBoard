'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { API_BASE, WS_BASE } from '../lib/config';
import { clearToken, getToken } from '../lib/auth';
import {
  buildShape,
  drawScene,
  parseShape,
  type Shape,
  type Tool,
  MIN_ZOOM,
  MAX_ZOOM,
  clampCamera,
} from '../lib/whiteboard';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useRoomContext,
  useTracks,
  type TrackReference,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  LogOut,
  Mic,
  MicOff,
  Pencil,
  Redo2,
  Slash,
  Square,
  Undo2,
  Users,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-react';

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

// ── Floating participant panel sizing ────────────────────────────────────
const PANEL_MIN_WIDTH = 220;
const PANEL_MAX_WIDTH = 640;
const PANEL_MIN_HEIGHT = 90;
const PANEL_MAX_HEIGHT = 380;
const PANEL_DEFAULT_WIDTH = 320;
const PANEL_DEFAULT_HEIGHT = 160;
const PANEL_VIEWPORT_MARGIN = 14;
const PARTICIPANTS_PER_PAGE = 4;

type PanelPosition = { x: number; y: number };
type PanelSize = { width: number; height: number };

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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function priorityRank(
  track: TrackReferenceOrPlaceholder,
  adminIdentity: string | undefined,
  localIdentity: string
) {
  const participant = track.participant;
  const isScreenShare = track.source === Track.Source.ScreenShare;

  if (adminIdentity && participant.identity === adminIdentity) return 0;
  if (participant.identity === localIdentity) return 1;
  if (participant.isSpeaking) return 2;
  if (isScreenShare) return 3;
  return 4;
}

// ── Floating Video Strip Component ───────────────────────────────────────
function VideoStrip({ adminIdentity }: { adminIdentity?: string }) {
  const room = useRoomContext();
  const localIdentity = room.localParticipant.identity;

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const [page, setPage] = useState(0);

  const sortedTracks = useMemo(() => {
    return [...tracks].sort((a, b) => {
      const rankA = priorityRank(a, adminIdentity, localIdentity);
      const rankB = priorityRank(b, adminIdentity, localIdentity);
      if (rankA !== rankB) return rankA - rankB;

      const lastSpokeA = (a.participant as unknown as { lastSpokeAt?: number }).lastSpokeAt ?? 0;
      const lastSpokeB = (b.participant as unknown as { lastSpokeAt?: number }).lastSpokeAt ?? 0;
      return lastSpokeB - lastSpokeA;
    });
  }, [tracks, adminIdentity, localIdentity]);

  const pageCount = Math.max(1, Math.ceil(sortedTracks.length / PARTICIPANTS_PER_PAGE));

  useEffect(() => {
    setPage((current) => clamp(current, 0, pageCount - 1));
  }, [pageCount]);

  const visibleTracks = sortedTracks.slice(
    page * PARTICIPANTS_PER_PAGE,
    page * PARTICIPANTS_PER_PAGE + PARTICIPANTS_PER_PAGE
  );

  if (tracks.length === 0) {
    return <div className="video-placeholder">Waiting for others to join...</div>;
  }

  return (
    <div className="video-strip-wrap">
      {pageCount > 1 && (
        <button
          type="button"
          className="video-strip-nav"
          onClick={() => setPage((current) => clamp(current - 1, 0, pageCount - 1))}
          disabled={page === 0}
          aria-label="Previous participants"
        >
          <ChevronLeft size={14} />
        </button>
      )}

      <div className="video-strip">
        {visibleTracks.map((track) => {
          const isLocal = track.participant.identity === localIdentity;
          const name = track.participant.name || track.participant.identity || (isLocal ? 'You' : 'Participant');

          return (
            <div
              className={`video-tile ${track.participant.isSpeaking ? 'speaking' : ''}`}
              key={track.participant.identity + track.source}
            >
              {'publication' in track && track.publication ? (
                <VideoTrack trackRef={track as TrackReference} />
              ) : (
                <div className="video-placeholder">Camera off</div>
              )}

              <div className="participant-overlay-badge">
                <span className="participant-name-tag" title={name}>
                  {name}
                </span>
                <div className="participant-status-icons">
                  <span
                    className={`status-chip ${track.participant.isMicrophoneEnabled ? 'on' : 'off'}`}
                    title={track.participant.isMicrophoneEnabled ? 'Mic active' : 'Muted'}
                  >
                    {track.participant.isMicrophoneEnabled ? <Mic size={11} /> : <MicOff size={11} />}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {pageCount > 1 && (
        <button
          type="button"
          className="video-strip-nav"
          onClick={() => setPage((current) => clamp(current + 1, 0, pageCount - 1))}
          disabled={page >= pageCount - 1}
          aria-label="Next participants"
        >
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}

function LiveKitMediaSync({ cameraOn, micOn }: { cameraOn: boolean; micOn: boolean }) {
  const room = useRoomContext();

  useEffect(() => {
    void room.localParticipant.setCameraEnabled(cameraOn).catch(() => {});
  }, [cameraOn, room]);

  useEffect(() => {
    void room.localParticipant.setMicrophoneEnabled(micOn).catch(() => {});
  }, [micOn, room]);

  return null;
}

// ── Main Workspace Component ─────────────────────────────────────────────
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
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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

  // ── Floating participant panel state ───────────────────────────────────
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null);
  const [panelSize, setPanelSize] = useState<PanelSize>({
    width: PANEL_DEFAULT_WIDTH,
    height: PANEL_DEFAULT_HEIGHT,
  });
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const dragStateRef = useRef({ startX: 0, startY: 0, originX: 0, originY: 0 });
  const resizeStateRef = useRef({ startX: 0, startY: 0, originWidth: 0, originHeight: 0 });

  const panStateRef = useRef<{
    active: boolean;
    pointerId: number | null;
    lastX: number;
    lastY: number;
  }>({
    active: false,
    pointerId: null,
    lastX: 0,
    lastY: 0,
  });

  const cameraRef = useRef({
    x: 0,
    y: 0,
    zoom: 1,
  });

  function handleSessionExpired() {
    clearToken();
    navigate('/signin', {
      replace: true,
      state: { message: 'Your session has expired. Please sign in again.' },
    });
  }

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 2800);
  }

  function clampPanelPosition(x: number, y: number, size: PanelSize): PanelPosition {
    if (typeof window === 'undefined') return { x, y };
    const maxX = Math.max(PANEL_VIEWPORT_MARGIN, window.innerWidth - size.width - PANEL_VIEWPORT_MARGIN);
    const maxY = Math.max(PANEL_VIEWPORT_MARGIN, window.innerHeight - size.height - PANEL_VIEWPORT_MARGIN);
    return {
      x: clamp(x, PANEL_VIEWPORT_MARGIN, maxX),
      y: clamp(y, PANEL_VIEWPORT_MARGIN, maxY),
    };
  }

  // Periodic token expiration check
  useEffect(() => {
    const interval = setInterval(() => {
      if (!getToken()) {
        handleSessionExpired();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // Initial panel placement (top right)
  useEffect(() => {
    function placeOrClamp() {
      setPanelPosition((current) => {
        const base = current ?? {
          x: window.innerWidth - panelSize.width - PANEL_VIEWPORT_MARGIN,
          y: PANEL_VIEWPORT_MARGIN,
        };
        return clampPanelPosition(base.x, base.y, panelSize);
      });
    }

    placeOrClamp();
    window.addEventListener('resize', placeOrClamp);
    return () => window.removeEventListener('resize', placeOrClamp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelSize.width, panelSize.height]);

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
    const currentToken = getToken();
    if (!currentToken) {
      handleSessionExpired();
      return;
    }
    if (!Number.isInteger(roomId)) {
      showToast('Room ID is invalid.');
      setLoading(false);
      return;
    }

    let isActive = true;

    async function loadRoomData() {
      try {
        const [roomRes, messagesRes] = await Promise.all([
          fetch(`${API_BASE}/rooms/${roomId}`, {
            headers: { Authorization: `Bearer ${currentToken}` },
          }),
          fetch(`${API_BASE}/rooms/${roomId}/messages`, {
            headers: { Authorization: `Bearer ${currentToken}` },
          }),
        ]);

        if (roomRes.status === 401 || messagesRes.status === 401) {
          handleSessionExpired();
          return;
        }

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
      } catch (error) {
        if (!isActive) return;
        showToast(error instanceof Error ? error.message : 'Unable to load this board.');
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
    const currentToken = getToken();
    if (!currentToken || !Number.isInteger(roomId)) return;

    let isActive = true;
    setVideoStatus('loading');

    async function fetchVideoToken() {
      try {
        const res = await fetch(`${API_BASE}/video-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentToken}`,
          },
          body: JSON.stringify({ roomId }),
        });

        if (res.status === 401) {
          handleSessionExpired();
          return;
        }

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
        showToast(error instanceof Error ? error.message : 'Unable to start video calling.');
      }
    }

    void fetchVideoToken();
    return () => {
      isActive = false;
    };
  }, [roomId, token]);

  // Whiteboard realtime sync over WebSocket
  useEffect(() => {
    const currentToken = getToken();
    if (!currentToken || !Number.isInteger(roomId)) return;

    const socket = new WebSocket(`${WS_BASE}?token=${encodeURIComponent(currentToken)}`);
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

    socket.addEventListener('close', (event) => {
      if (event.code === 1008 || event.reason === 'Unauthorized') {
        handleSessionExpired();
        return;
      }
      showToast('Connection interrupted. Reconnecting if sync stops.');
    });

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'leave_room', roomId }));
      }
      socket.close();
      socketRef.current = null;
    };
  }, [roomId, token]);

  // Canvas redraw trigger on shapes change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    drawScene(canvas, context, shapes, cameraRef.current, draftShapeRef.current);
  }, [shapes]);

  function getCanvasCoordinates(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const screenX = (event.clientX - rect.left) * (canvas.width / rect.width);
    const screenY = (event.clientY - rect.top) * (canvas.height / rect.height);
    const camera = cameraRef.current;

    return {
      x: (screenX - camera.x) / camera.zoom,
      y: (screenY - camera.y) / camera.zoom,
    };
  }

  function saveHistory() {
    undoStack.current.push(shapesRef.current.map((shape) => structuredClone(shape)));
    redoStack.current = [];
  }

  function handleWheel(event: ReactWheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const camera = cameraRef.current;
    const oldZoom = camera.zoom;
    const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom * zoomFactor));

    if (newZoom === oldZoom) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = (event.clientX - rect.left) * (canvas.width / rect.width);
    const mouseY = (event.clientY - rect.top) * (canvas.height / rect.height);

    const worldX = (mouseX - camera.x) / oldZoom;
    const worldY = (mouseY - camera.y) / oldZoom;

    camera.zoom = newZoom;
    camera.x = mouseX - worldX * newZoom;
    camera.y = mouseY - worldY * newZoom;

    cameraRef.current = clampCamera(camera, canvas.width, canvas.height);
    redrawBoard();
  }

  function redrawBoard(previewShape?: Shape | null) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    drawScene(canvas, context, shapesRef.current, cameraRef.current, previewShape);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    // RIGHT CLICK or MIDDLE CLICK → PAN
    if (event.button === 2 || event.button === 1) {
      event.preventDefault();
      panStateRef.current = {
        active: true,
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    // ONLY LEFT CLICK DRAWS
    if (event.button !== 0) return;

    const coordinates = getCanvasCoordinates(event);
    if (!coordinates) return;

    drawStateRef.current = {
      drawing: true,
      startX: coordinates.x,
      startY: coordinates.y,
    };

    event.currentTarget.setPointerCapture(event.pointerId);

    if (toolRef.current === 'pencil') {
      draftShapeRef.current = {
        type: 'pencil',
        points: [coordinates],
      };
      redrawBoard(draftShapeRef.current);
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    // PANNING
    if (panStateRef.current.active && panStateRef.current.pointerId === event.pointerId) {
      const dx = event.clientX - panStateRef.current.lastX;
      const dy = event.clientY - panStateRef.current.lastY;

      cameraRef.current.x += dx;
      cameraRef.current.y += dy;
      panStateRef.current.lastX = event.clientX;
      panStateRef.current.lastY = event.clientY;

      const canvas = canvasRef.current;
      if (canvas) {
        cameraRef.current = clampCamera(cameraRef.current, canvas.width, canvas.height);
      }
      redrawBoard();
      return;
    }

    // DRAWING
    if (!drawStateRef.current.drawing) return;

    const coordinates = getCanvasCoordinates(event);
    if (!coordinates) return;

    if (toolRef.current === 'pencil') {
      const draft = draftShapeRef.current;
      if (!draft || draft.type !== 'pencil') return;

      draft.points.push(coordinates);
      redrawBoard(draft);
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

    if (toolRef.current === 'pencil') {
      if (!draftShapeRef.current || draftShapeRef.current.type !== 'pencil') return;
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

    if (socket && socket.readyState === WebSocket.OPEN) {
      pendingShapesRef.current.push(serializedShape);
      socket.send(JSON.stringify({ type: 'chat', roomId, message: serializedShape }));
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (panStateRef.current.active && panStateRef.current.pointerId === event.pointerId) {
      panStateRef.current.active = false;
      panStateRef.current.pointerId = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }

    if (event.button === 0) {
      finishDrawing(event, true);
    }
  }

  function handlePointerLeave(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (panStateRef.current.active) return;
    if (event.button === 0) {
      finishDrawing(event, false);
    }
  }

  function handleLeaveRoom() {
    navigate('/join-room', { replace: true });
  }

  function undo() {
    if (undoStack.current.length === 0) return;
    redoStack.current.push(structuredClone(shapesRef.current));
    const previous = undoStack.current.pop()!;
    shapesRef.current = previous;
    setShapes(previous);
    redrawBoard();
  }

  function redo() {
    if (redoStack.current.length === 0) return;
    undoStack.current.push(structuredClone(shapesRef.current));
    const next = redoStack.current.pop()!;
    shapesRef.current = next;
    setShapes(next);
    redrawBoard();
  }

  // Keyboard Shortcuts
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))
      ) {
        event.preventDefault();
        redo();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Panel Drag handlers
  function handlePanelDragPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!panelPosition) return;
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: panelPosition.x,
      originY: panelPosition.y,
    };
    setIsDraggingPanel(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePanelDragPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isDraggingPanel) return;
    const deltaX = event.clientX - dragStateRef.current.startX;
    const deltaY = event.clientY - dragStateRef.current.startY;
    const next = clampPanelPosition(
      dragStateRef.current.originX + deltaX,
      dragStateRef.current.originY + deltaY,
      panelSize
    );
    setPanelPosition(next);
  }

  function handlePanelDragPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isDraggingPanel) return;
    setIsDraggingPanel(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  // Panel Resize handlers
  function handlePanelResizePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    resizeStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originWidth: panelSize.width,
      originHeight: panelSize.height,
    };
    setIsResizingPanel(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePanelResizePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isResizingPanel) return;
    const deltaX = event.clientX - resizeStateRef.current.startX;
    const deltaY = event.clientY - resizeStateRef.current.startY;
    const nextSize: PanelSize = {
      width: clamp(resizeStateRef.current.originWidth + deltaX, PANEL_MIN_WIDTH, PANEL_MAX_WIDTH),
      height: clamp(resizeStateRef.current.originHeight + deltaY, PANEL_MIN_HEIGHT, PANEL_MAX_HEIGHT),
    };
    setPanelSize(nextSize);
    setPanelPosition((current) => (current ? clampPanelPosition(current.x, current.y, nextSize) : current));
  }

  function handlePanelResizePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isResizingPanel) return;
    setIsResizingPanel(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleCopyRoomId() {
    if (roomId) {
      void navigator.clipboard.writeText(String(roomId));
      setCopied(true);
      showToast(`Copied Room ID #${roomId} to clipboard`);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <main className="board-shell">
      <section className="board-panel">
        {/* Canvas as Hero */}
        {loading ? (
          <div className="board-empty">Connecting to workspace...</div>
        ) : (
          <div className="canvas-wrap">
            <canvas
              ref={canvasRef}
              className="board-canvas"
              width={1920}
              height={1080}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerLeave}
              onWheel={handleWheel}
              onContextMenu={(event) => event.preventDefault()}
            />
          </div>
        )}

        {/* Top-Left Room Metadata Badge */}
        <div className="room-meta-pill">
          <span className="room-meta-name">{roomLabel}</span>
          <span className="room-meta-divider" />
          <span className="room-id-badge">#{roomId}</span>
          <button
            className="copy-id-btn"
            type="button"
            onClick={handleCopyRoomId}
            title="Copy Room ID"
            aria-label="Copy Room ID"
          >
            {copied ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
          </button>
        </div>

        {/* Status Toast */}
        {toastMessage && <div className="status-toast">{toastMessage}</div>}

        {/* Floating Participant Video Panel (PiP) */}
        {panelPosition && (
          <div
            className={`video-wrap ${isDraggingPanel || isResizingPanel ? 'no-transition' : ''} ${
              isDraggingPanel ? 'dragging' : ''
            }`}
            style={{
              left: panelPosition.x,
              top: panelPosition.y,
              width: panelSize.width,
              height: panelSize.height,
            }}
          >
            <div
              className="panel-drag-handle"
              onPointerDown={handlePanelDragPointerDown}
              onPointerMove={handlePanelDragPointerMove}
              onPointerUp={handlePanelDragPointerUp}
              onPointerLeave={handlePanelDragPointerUp}
              role="button"
              tabIndex={0}
              aria-label="Drag participant panel"
            >
              <div className="panel-drag-title">
                <Users size={12} />
                <span>Participants</span>
              </div>
              <span className="panel-participant-count">Live</span>
            </div>

            <div className="video-wrap-body">
              {videoStatus === 'loading' && <div className="video-placeholder">Connecting video...</div>}
              {videoStatus === 'error' && (
                <div className="video-placeholder error">Video unavailable</div>
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
                  <VideoStrip adminIdentity={room?.admin?.id} />
                </LiveKitRoom>
              )}
            </div>

            <div
              className="panel-resize-grip-corner"
              onPointerDown={handlePanelResizePointerDown}
              onPointerMove={handlePanelResizePointerMove}
              onPointerUp={handlePanelResizePointerUp}
              onPointerLeave={handlePanelResizePointerUp}
              role="separator"
              aria-label="Resize panel"
            >
              <span aria-hidden="true" />
            </div>
          </div>
        )}

        {/* Ergonomic Floating Bottom Dock Toolbar */}
        <nav className="dock-toolbar" aria-label="Meeting Controls">
          {/* Drawing Tools Cluster */}
          <div className="dock-group" role="group" aria-label="Drawing Tools">
            <button
              className={`dock-item ${selectedTool === 'rectangle' ? 'active' : ''}`}
              type="button"
              onClick={() => setSelectedTool('rectangle')}
              title="Rectangle tool"
              aria-label="Rectangle"
            >
              <Square size={17} />
            </button>
            <button
              className={`dock-item ${selectedTool === 'circle' ? 'active' : ''}`}
              type="button"
              onClick={() => setSelectedTool('circle')}
              title="Circle tool"
              aria-label="Circle"
            >
              <Circle size={17} />
            </button>
            <button
              className={`dock-item ${selectedTool === 'line' ? 'active' : ''}`}
              type="button"
              onClick={() => setSelectedTool('line')}
              title="Line tool"
              aria-label="Line"
            >
              <Slash size={17} />
            </button>
            <button
              className={`dock-item ${selectedTool === 'pencil' ? 'active' : ''}`}
              type="button"
              onClick={() => setSelectedTool('pencil')}
              title="Freehand Pencil"
              aria-label="Pencil"
            >
              <Pencil size={17} />
            </button>
          </div>

          <div className="dock-separator" />

          {/* History Cluster */}
          <div className="dock-group" role="group" aria-label="History">
            <button
              className="dock-item"
              type="button"
              onClick={undo}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <Undo2 size={17} />
            </button>
            <button
              className="dock-item"
              type="button"
              onClick={redo}
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
            >
              <Redo2 size={17} />
            </button>
          </div>

          <div className="dock-separator" />

          {/* Media Cluster */}
          <div className="dock-group" role="group" aria-label="Media Controls">
            <button
              className={`dock-item ${!cameraOn ? 'muted' : ''}`}
              type="button"
              onClick={() => setCameraOn((prev) => !prev)}
              title={cameraOn ? 'Turn off camera' : 'Turn on camera'}
              aria-label="Camera"
            >
              {cameraOn ? <Video size={17} /> : <VideoOff size={17} />}
            </button>
            <button
              className={`dock-item ${!micOn ? 'muted' : ''}`}
              type="button"
              onClick={() => setMicOn((prev) => !prev)}
              title={micOn ? 'Mute microphone' : 'Unmute microphone'}
              aria-label="Microphone"
            >
              {micOn ? <Mic size={17} /> : <MicOff size={17} />}
            </button>
            <button
              className={`dock-item ${!speakerOn ? 'muted' : ''}`}
              type="button"
              onClick={() => setSpeakerOn((prev) => !prev)}
              title={speakerOn ? 'Mute audio' : 'Unmute audio'}
              aria-label="Audio"
            >
              {speakerOn ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </button>
          </div>

          <div className="dock-separator" />

          {/* Room Action */}
          <div className="dock-group">
            <button
              className="dock-leave-btn"
              type="button"
              onClick={handleLeaveRoom}
              title="Leave Room"
            >
              <LogOut size={15} />
              <span>Leave</span>
            </button>
          </div>
        </nav>
      </section>
    </main>
  );
}