import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Home from './componants/Home';
import SignIn from './componants/SignIn';
import SignUp from './componants/SignUp';
import JoinRoom from './componants/JoinRoom';
import ChatRoom from './componants/ChatRoom';
import { clearToken, isAuthenticated } from './lib/auth';

function ProtectedRoute({ children }: { children: ReactNode }) {
  if (!isAuthenticated()) {
    clearToken();
    return <Navigate to="/signin" replace state={{ message: 'Your session has expired. Please sign in again.' }} />;
  }

  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/signin" element={<SignIn />} />
      <Route
        path="/join-room"
        element={
          <ProtectedRoute>
            <JoinRoom />
          </ProtectedRoute>
        }
      />
      <Route
        path="/rooms/:roomId"
        element={
          <ProtectedRoute>
            <ChatRoom />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
