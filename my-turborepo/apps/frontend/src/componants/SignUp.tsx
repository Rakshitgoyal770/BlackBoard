import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE } from '../lib/config';
import { AlertCircle, CheckCircle2, Loader2, UserPlus } from 'lucide-react';

export default function SignUp() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch(`${API_BASE}/SignUp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const text = await res.text();
      if (!res.ok) {
        setStatus({ type: 'error', message: text || 'Sign up failed' });
        return;
      }

      setStatus({ type: 'success', message: 'Account created successfully! You can now sign in.' });
      setUsername('');
      setPassword('');
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
          <h1>Create account</h1>
          <p className="subtitle">Start collaborating with zero friction.</p>
        </header>

        <form className="auth-form" onSubmit={onSubmit}>
          <div className="form-group">
            <label htmlFor="signup-username">Username</label>
            <input
              id="signup-username"
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Choose a username"
              autoComplete="username"
              required
              minLength={3}
            />
          </div>

          <div className="form-group">
            <label htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete="new-password"
              required
              minLength={6}
            />
          </div>

          <button className="btn btn-primary btn-full" disabled={loading} type="submit">
            {loading ? (
              <>
                <Loader2 size={16} className="spin" />
                <span>Creating account...</span>
              </>
            ) : (
              <>
                <UserPlus size={16} />
                <span>Sign up</span>
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
          Already have an account? <Link to="/signin">Sign in</Link>
        </div>
      </section>
    </main>
  );
}
