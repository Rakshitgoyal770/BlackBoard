import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API_BASE } from '../lib/config';

export default function SignIn() {
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    async function onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setLoading(true);
        setMessage('');

        try {
            const res = await fetch(`${API_BASE}/Login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const text = await res.text();
            if (!res.ok) {
                setMessage(text || 'Sign in failed');
                return;
            }

            const payload = JSON.parse(text) as { token?: string };
            if (payload.token) {
                localStorage.setItem('token', payload.token);
                setMessage('Signed in successfully. Redirecting to join room...');
                navigate('/join-room');
            } else {
                setMessage('Login succeeded but token was missing in response.');
            }
        } catch {
            setMessage('Unable to connect to backend. Is server running on port 5000?');
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="auth-shell">
            <section className="auth-card">
                <p className="eyebrow">BlackBoard</p>
                <h1>Sign in</h1>
                <form className="auth-form" onSubmit={onSubmit}>
                    <label>
                        Username
                        <input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="your_username"
                            required
                        />
                    </label>
                    <label>
                        Password
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            required
                        />
                    </label>
                    <button className="btn btn-primary" disabled={loading} type="submit">
                        {loading ? 'Signing in...' : 'Sign in'}
                    </button>
                </form>
                {message && <p className="status-line">{message}</p>}
                <p className="switch-line">
                    New here? <Link to="/signup">Create account</Link>
                </p>
            </section>
        </main>
    );
}
