import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clearToken, getToken } from '../lib/auth';
import { API_BASE } from '../lib/config';

export default function JoinRoom() {
  const navigate = useNavigate();
  const [roomName, setRoomName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

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
        navigate(`/rooms/${payload.roomId}`);
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
    navigate(`/rooms/${normalizedRoomId}`);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">BlackBoard</p>
        <h1>Join room</h1>
        <p className="subtitle">Create a room or enter an existing room id.</p>

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
