import { Link } from 'react-router-dom';

export default function Home() {
    const token = localStorage.getItem('token');

    return (
        <main className="auth-shell">
            <section className="auth-card">
                <p className="eyebrow">BlackBoard</p>
                <h1>Welcome</h1>
                <p className="subtitle">
                    Create an account or sign in to continue.
                </p>
                <div className="home-actions">
                    {token ? (
                        <Link to="/join-room" className="btn btn-primary">
                            Join a room
                        </Link>
                    ) : (
                        <>
                            <Link to="/signup" className="btn btn-primary">
                                Create account
                            </Link>
                            <Link to="/signin" className="btn btn-ghost">
                                Sign in
                            </Link>
                        </>
                    )}
                </div>
                <p className="status-line">
                    {token
                        ? 'You are signed in. Continue to join a room.'
                        : 'No active session yet.'}
                </p>
            </section>
        </main>
    );
}