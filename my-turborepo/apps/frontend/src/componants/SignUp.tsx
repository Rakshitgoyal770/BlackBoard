import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE } from '../lib/config';

export default function SignUp() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    async function onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setLoading(true);
        setMessage('');

        try {
            const res = await fetch(`${API_BASE}/SignUp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const text = await res.text();
            if (!res.ok) {
                setMessage(text || 'Sign up failed');
                return;
            }

            setMessage('Account created. You can sign in now.');
            setUsername('');
            setPassword('');
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
                <h1>Create account</h1>
                <form className="auth-form" onSubmit={onSubmit}>
                    <label>
                        Username
                        <input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="your_username"
                            required
                            minLength={3}
                        />
                    </label>
                    <label>
                        Password
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Choose a password"
                            required
                            minLength={6}
                        />
                    </label>
                    <button className="btn btn-primary" disabled={loading} type="submit">
                        {loading ? 'Creating...' : 'Sign up'}
                    </button>
                </form>
                {message && <p className="status-line">{message}</p>}
                <p className="switch-line">
                    Already have an account? <Link to="/signin">Sign in</Link>
                </p>
            </section>
        </main>
    );
}
