import { Link } from 'react-router-dom';
import { clearToken, getToken } from '../lib/auth';
import { ArrowRight, LogIn, LogOut, UserPlus } from 'lucide-react';

export default function Home() {
  const token = getToken();

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <header className="auth-header">
          <div className="brand-badge">
            <span className="brand-dot" />
            MeetX
          </div>
          <h1>Collaborative Space</h1>
          <p className="subtitle">
            Real-time whiteboard and video meetings for focused teams.
          </p>
        </header>

        <div className="home-actions">
          {token ? (
            <>
              <Link to="/join-room" className="btn btn-primary btn-full">
                <span>Continue to Room</span>
                <ArrowRight size={16} />
              </Link>
              <button
                className="btn btn-secondary btn-full"
                type="button"
                onClick={() => {
                  clearToken();
                  window.location.reload();
                }}
              >
                <LogOut size={16} />
                <span>Sign out</span>
              </button>
            </>
          ) : (
            <>
              <Link to="/signup" className="btn btn-primary btn-full">
                <UserPlus size={16} />
                <span>Create account</span>
              </Link>
              <Link to="/signin" className="btn btn-secondary btn-full">
                <LogIn size={16} />
                <span>Sign in</span>
              </Link>
            </>
          )}
        </div>

        <div className="status-line">
          {token
            ? 'Active session found. Continue to join or create a room.'
            : 'Sign in to start collaborating.'}
        </div>
      </section>
    </main>
  );
}
