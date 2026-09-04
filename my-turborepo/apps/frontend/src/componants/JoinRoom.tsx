import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clearToken, getToken } from '../lib/auth';
import { API_BASE } from '../lib/config';
import {
  AlertCircle,
  ArrowRight,
  Camera,
  CameraOff,
  CheckCircle2,
  Loader2,
  LogOut,
  Mic,
  MicOff,
  Plus,
  Video,
} from 'lucide-react';

type MediaPermissionStatus = 'idle' | 'requesting' | 'granted' | 'denied';

export default function JoinRoom() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');
  const [roomName, setRoomName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [status, setStatus] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // ── Camera/mic permission + preview state ──────────────────────────────
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<MediaPermissionStatus>('idle');
  const [permissionError, setPermissionError] = useState('');
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  async function requestMediaAccess() {
    setPermissionStatus('requesting');
    setPermissionError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      streamRef.current = stream;
      setPermissionStatus('granted');
    } catch (error) {
      setPermissionStatus('denied');
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setPermissionError(
          'Camera/mic access was blocked. You can still join, but others won’t see or hear you until permitted in browser settings.'
        );
      } else if (error instanceof DOMException && error.name === 'NotFoundError') {
        setPermissionError('No camera or microphone was found on this device.');
      } else {
        setPermissionError('Unable to access camera/microphone.');
      }
    }
  }

  function toggleCamera() {
    const stream = streamRef.current;
    if (!stream) return;

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setCameraOn(videoTrack.enabled);
    }
  }

  function toggleMic() {
    const stream = streamRef.current;
    if (!stream) return;

    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setMicOn(audioTrack.enabled);
    }
  }

  useEffect(() => {
    void requestMediaAccess();

    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (permissionStatus === 'granted' && streamRef.current && videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = streamRef.current;
    }
  }, [permissionStatus]);

  async function onCreateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getToken();

    if (!token) {
      clearToken();
      navigate('/signin', { replace: true, state: { message: 'Your session has expired. Please sign in again.' } });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch(`${API_BASE}/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: roomName }),
      });

      if (res.status === 401) {
        clearToken();
        navigate('/signin', { replace: true, state: { message: 'Your session has expired. Please sign in again.' } });
        return;
      }

      const text = await res.text();
      if (!res.ok) {
        setStatus({ type: 'error', message: text || 'Failed to create room.' });
        return;
      }

      const payload = JSON.parse(text) as { roomId?: number };
      if (payload.roomId) {
        setStatus({ type: 'success', message: `Room created! Opening room #${payload.roomId}...` });
        navigate(`/rooms/${payload.roomId}`, {
          state: { cameraOn, micOn },
        });
      } else {
        setStatus({ type: 'error', message: 'Room created, but room ID was missing.' });
      }
    } catch {
      setStatus({ type: 'error', message: 'Unable to create room. Check backend connection.' });
    } finally {
      setLoading(false);
    }
  }

  function onJoinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getToken();

    if (!token) {
      clearToken();
      navigate('/signin', { replace: true, state: { message: 'Your session has expired. Please sign in again.' } });
      return;
    }

    const normalizedRoomId = roomId.trim();

    if (!normalizedRoomId) {
      setStatus({ type: 'error', message: 'Enter a room ID to continue.' });
      return;
    }

    if (!/^\d+$/.test(normalizedRoomId)) {
      setStatus({ type: 'error', message: 'Room ID should contain numbers only.' });
      return;
    }

    setStatus({ type: 'success', message: `Opening room #${normalizedRoomId}...` });
    navigate(`/rooms/${normalizedRoomId}`, {
      state: { cameraOn, micOn },
    });
  }

  return (
    <main className="auth-shell">
      <section className="auth-card wide-card">
        <header className="auth-header">
          <div className="brand-badge">
            <span className="brand-dot" />
            MeetX Lobby
          </div>
          <h1>Ready to collaborate?</h1>
          <p className="subtitle">Check your audio & video preview before entering the workspace.</p>
        </header>

        <div className="lobby-grid">
          {/* Media Preview Column */}
          <div className="media-preview-card">
            <div className="media-preview-frame">
              {permissionStatus === 'granted' ? (
                <>
                  <video
                    ref={videoPreviewRef}
                    autoPlay
                    muted
                    playsInline
                    className="media-preview-video"
                    style={{ opacity: cameraOn ? 1 : 0.1 }}
                  />
                  <div className={`media-preview-overlay ${cameraOn ? '' : 'off'}`}>
                    <span className="status-dot" />
                    <span>{cameraOn ? 'Camera Active' : 'Camera Off'}</span>
                  </div>
                </>
              ) : (
                <div className="media-preview-placeholder">
                  <Video size={24} />
                  <span>
                    {permissionStatus === 'requesting'
                      ? 'Requesting camera & mic...'
                      : 'Camera preview unavailable'}
                  </span>
                </div>
              )}
            </div>

            {permissionStatus === 'denied' && (
              <button className="btn btn-secondary btn-full" type="button" onClick={requestMediaAccess}>
                Try requesting access again
              </button>
            )}

            {permissionStatus === 'granted' && (
              <div className="media-controls-row">
                <button
                  className={`media-toggle-btn ${!cameraOn ? 'muted' : ''}`}
                  type="button"
                  onClick={toggleCamera}
                >
                  {cameraOn ? <Camera size={16} /> : <CameraOff size={16} />}
                  <span>{cameraOn ? 'Camera on' : 'Camera off'}</span>
                </button>
                <button
                  className={`media-toggle-btn ${!micOn ? 'muted' : ''}`}
                  type="button"
                  onClick={toggleMic}
                >
                  {micOn ? <Mic size={16} /> : <MicOff size={16} />}
                  <span>{micOn ? 'Mic on' : 'Mic off'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Room Action Form Column */}
          <div>
            <div className="lobby-tabs">
              <button
                type="button"
                className={`lobby-tab ${activeTab === 'create' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('create');
                  setStatus(null);
                }}
              >
                Create new room
              </button>
              <button
                type="button"
                className={`lobby-tab ${activeTab === 'join' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('join');
                  setStatus(null);
                }}
              >
                Join with ID
              </button>
            </div>

            {activeTab === 'create' ? (
              <form className="auth-form" onSubmit={onCreateRoom}>
                <div className="form-group">
                  <label htmlFor="room-name">Room name</label>
                  <input
                    id="room-name"
                    className="form-input"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="e.g. Design review"
                    required
                  />
                </div>
                <button className="btn btn-primary btn-full" disabled={loading} type="submit">
                  {loading ? (
                    <>
                      <Loader2 size={16} className="spin" />
                      <span>Creating room...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      <span>Create and join room</span>
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form className="auth-form" onSubmit={onJoinRoom}>
                <div className="form-group">
                  <label htmlFor="room-id">Room ID</label>
                  <input
                    id="room-id"
                    className="form-input"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    placeholder="e.g. 104"
                    required
                  />
                </div>
                <button className="btn btn-primary btn-full" type="submit">
                  <span>Enter room</span>
                  <ArrowRight size={16} />
                </button>
              </form>
            )}

            {permissionError && (
              <div className="status-line error">
                <AlertCircle size={15} />
                <span>{permissionError}</span>
              </div>
            )}

            {status && (
              <div className={`status-line ${status.type}`}>
                {status.type === 'error' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
                <span>{status.message}</span>
              </div>
            )}
          </div>
        </div>

        <div className="join-footer">
          <Link to="/" className="text-secondary" style={{ fontSize: '13px' }}>
            ← Back to Home
          </Link>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              clearToken();
              navigate('/signin', { replace: true });
            }}
          >
            <LogOut size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}
