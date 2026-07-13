// import { useState } from 'react';
// import type { FormEvent } from 'react';
// import { Link, useNavigate } from 'react-router-dom';
// import { clearToken, getToken } from '../lib/auth';
// import { API_BASE } from '../lib/config';

// export default function JoinRoom() {
//   const navigate = useNavigate();
//   const [roomName, setRoomName] = useState('');
//   const [roomId, setRoomId] = useState('');
//   const [message, setMessage] = useState('');
//   const [loading, setLoading] = useState(false);

//   async function onCreateRoom(event: FormEvent<HTMLFormElement>) {
//     event.preventDefault();
//     const token = getToken();

//     if (!token) {
//       setMessage('Please sign in first.');
//       return;
//     }

//     setLoading(true);
//     setMessage('');

//     try {
//       const res = await fetch(`${API_BASE}/rooms`, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//           Authorization: `Bearer ${token}`,
//         },
//         body: JSON.stringify({ name: roomName }),
//       });

//       const text = await res.text();
//       if (!res.ok) {
//         setMessage(text || 'Failed to create room.');
//         return;
//       }

//       const payload = JSON.parse(text) as { roomId?: number };
//       if (payload.roomId) {
//         setRoomId(String(payload.roomId));
//         setMessage(`Room created. Redirecting to room ${payload.roomId}.`);
//         navigate(`/rooms/${payload.roomId}`);
//       } else {
//         setMessage('Room created, but room id was missing.');
//       }
//     } catch {
//       setMessage('Unable to create room. Check backend connection.');
//     } finally {
//       setLoading(false);
//     }
//   }

//   function onJoinRoom(event: FormEvent<HTMLFormElement>) {
//     event.preventDefault();
//     const normalizedRoomId = roomId.trim();

//     if (!normalizedRoomId) {
//       setMessage('Enter a room id to continue.');
//       return;
//     }

//     if (!/^\d+$/.test(normalizedRoomId)) {
//       setMessage('Room id should contain numbers only.');
//       return;
//     }

//     setMessage(`Opening room ${normalizedRoomId}...`);
//     navigate(`/rooms/${normalizedRoomId}`);
//   }

//   return (
//     <main className="auth-shell">
//       <section className="auth-card">
//         <p className="eyebrow">BlackBoard</p>
//         <h1>Join room</h1>
//         <p className="subtitle">Create a room or enter an existing room id.</p>

//         <form className="auth-form" onSubmit={onCreateRoom}>
//           <label>
//             Create room name
//             <input
//               value={roomName}
//               onChange={(e) => setRoomName(e.target.value)}
//               placeholder="product-standup"
//               required
//             />
//           </label>
//           <button className="btn btn-primary" disabled={loading} type="submit">
//             {loading ? 'Creating room...' : 'Create room'}
//           </button>
//         </form>

//         <div className="form-gap" />

//         <form className="auth-form" onSubmit={onJoinRoom}>
//           <label>
//             Room id
//             <input
//               value={roomId}
//               onChange={(e) => setRoomId(e.target.value)}
//               placeholder="Enter room id"
//               required
//             />
//           </label>
//           <button className="btn btn-ghost" type="submit">
//             Continue to room
//           </button>
//         </form>

//         {message && <p className="status-line">{message}</p>}

//         <div className="join-footer">
//           <p className="switch-line">
//             <Link to="/">Back to home</Link>
//           </p>
//           <button
//             className="text-button"
//             type="button"
//             onClick={() => {
//               clearToken();
//               navigate('/signin', { replace: true });
//             }}
//           >
//             Sign out
//           </button>
//         </div>
//       </section>
//     </main>
//   );
// }


import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clearToken, getToken } from '../lib/auth';
import { API_BASE } from '../lib/config';

type MediaPermissionStatus = 'idle' | 'requesting' | 'granted' | 'denied';

export default function JoinRoom() {
  const navigate = useNavigate();
  const [roomName, setRoomName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Camera/mic permission + preview state ──────────────────────────────
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<MediaPermissionStatus>('idle');
  const [permissionError, setPermissionError] = useState('');
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  // Ask for camera + mic access and start a live preview
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
          'Camera/mic access was blocked. You can still join, but others won\'t see or hear you until you allow access in your browser settings.'
        );
      } else if (error instanceof DOMException && error.name === 'NotFoundError') {
        setPermissionError('No camera or microphone was found on this device.');
      } else {
        setPermissionError('Unable to access camera/microphone.');
      }
    }
  }

  // Toggle camera track on/off without re-requesting permission
  function toggleCamera() {
    const stream = streamRef.current;
    if (!stream) return;

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setCameraOn(videoTrack.enabled);
    }
  }

  // Toggle mic track on/off without re-requesting permission
  function toggleMic() {
    const stream = streamRef.current;
    if (!stream) return;

    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setMicOn(audioTrack.enabled);
    }
  }

  // Ask for permission automatically once the page loads
  useEffect(() => {
    void requestMediaAccess();

    // Stop all tracks when leaving this page (release the camera/mic)
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // The preview element mounts only after permission is granted, so attach the
  // stream after React has rendered that element.
  useEffect(() => {
    if (permissionStatus === 'granted' && streamRef.current && videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = streamRef.current;
    }
  }, [permissionStatus]);

  async function onCreateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getToken();

    if (!token) {
      setMessage('Please sign in first.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const res = await fetch(`${API_BASE}/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: roomName }),
      });

      const text = await res.text();
      if (!res.ok) {
        setMessage(text || 'Failed to create room.');
        return;
      }

      const payload = JSON.parse(text) as { roomId?: number };
      if (payload.roomId) {
        setRoomId(String(payload.roomId));
        setMessage(`Room created. Redirecting to room ${payload.roomId}.`);
        navigate(`/rooms/${payload.roomId}`, {
          state: { cameraOn, micOn },
        });
      } else {
        setMessage('Room created, but room id was missing.');
      }
    } catch {
      setMessage('Unable to create room. Check backend connection.');
    } finally {
      setLoading(false);
    }
  }

  function onJoinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedRoomId = roomId.trim();

    if (!normalizedRoomId) {
      setMessage('Enter a room id to continue.');
      return;
    }

    if (!/^\d+$/.test(normalizedRoomId)) {
      setMessage('Room id should contain numbers only.');
      return;
    }

    setMessage(`Opening room ${normalizedRoomId}...`);
    navigate(`/rooms/${normalizedRoomId}`, {
      state: { cameraOn, micOn },
    });
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">BlackBoard</p>
        <h1>Join room</h1>
        <p className="subtitle">Create a room or enter an existing room id.</p>

        {/* ── Camera/mic preview + permission section ──────────────────── */}
        <div className="media-preview-card">
          <div className="media-preview-frame">
            {permissionStatus === 'granted' ? (
              <video
                ref={videoPreviewRef}
                autoPlay
                muted
                playsInline
                className="media-preview-video"
                style={{ opacity: cameraOn ? 1 : 0.15 }}
              />
            ) : (
              <div className="media-preview-placeholder">
                {permissionStatus === 'requesting'
                  ? 'Requesting camera access...'
                  : 'Camera preview unavailable'}
              </div>
            )}
          </div>

          {permissionError && <p className="status-line">{permissionError}</p>}

          {permissionStatus === 'denied' && (
            <button className="btn btn-ghost" type="button" onClick={requestMediaAccess}>
              Try again
            </button>
          )}

          {permissionStatus === 'granted' && (
            <div className="media-controls">
              <button
                className={`tool-button ${cameraOn ? 'active' : ''}`}
                type="button"
                onClick={toggleCamera}
              >
                {cameraOn ? 'Camera on' : 'Camera off'}
              </button>
              <button
                className={`tool-button ${micOn ? 'active' : ''}`}
                type="button"
                onClick={toggleMic}
              >
                {micOn ? 'Mic on' : 'Mic off'}
              </button>
            </div>
          )}
        </div>

        <form className="auth-form" onSubmit={onCreateRoom}>
          <label>
            Create room name
            <input
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="product-standup"
              required
            />
          </label>
          <button className="btn btn-primary" disabled={loading} type="submit">
            {loading ? 'Creating room...' : 'Create room'}
          </button>
        </form>

        <div className="form-gap" />

        <form className="auth-form" onSubmit={onJoinRoom}>
          <label>
            Room id
            <input
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter room id"
              required
            />
          </label>
          <button className="btn btn-ghost" type="submit">
            Continue to room
          </button>
        </form>

        {message && <p className="status-line">{message}</p>}

        <div className="join-footer">
          <p className="switch-line">
            <Link to="/">Back to home</Link>
          </p>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              clearToken();
              navigate('/signin', { replace: true });
            }}
          >
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}
