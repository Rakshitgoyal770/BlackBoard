import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { API_BASE } from '../lib/config';
import { setToken } from '../lib/auth';
import { AlertCircle, CheckCircle2, Loader2, LogIn } from 'lucide-react';

export default function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    const stateMessage = (location.state as { message?: string } | null)?.message;
    if (stateMessage) {
      setStatus({ type: 'error', message: stateMessage });
    }
  }, [location.state]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch(`${API_BASE}/Login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const text = await res.text();
      if (!res.ok) {
        setStatus({ type: 'error', message: text || 'Invalid username or password' });
        return;
      }

      const payload = JSON.parse(text) as { token?: string };
      if (payload.token) {
        setToken(payload.token);
        setStatus({ type: 'success', message: 'Signed in successfully. Redirecting...' });
        setTimeout(() => navigate('/join-room'), 400);
      } else {
        setStatus({ type: 'error', message: 'Authentication response was missing a token.' });
      }
    } catch {
      setStatus({ type: 'error', message: 'Unable to connect to server. Please check backend connection.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <header className="auth-header">
          <div className="brand-badge">
            <span className="brand-dot" />
            MeetX
          </div>
          <h1>Welcome back</h1>
          <p className="subtitle">Enter your credentials to access your rooms.</p>
        </header>

        <form className="auth-form" onSubmit={onSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. alex"
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          <button className="btn btn-primary btn-full" disabled={loading} type="submit">
            {loading ? (
              <>
                <Loader2 size={16} className="spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <LogIn size={16} />
                <span>Sign in</span>
              </>
            )}
          </button>
        </form>

        {status && (
          <div className={`status-line ${status.type}`}>
            {status.type === 'error' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
            <span>{status.message}</span>
          </div>
        )}

        <div className="switch-line">
          Don&apos;t have an account? <Link to="/signup">Create one</Link>
        </div>
      </section>
    </main>
  );
}
