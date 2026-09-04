export interface JwtPayload {
  userId?: string | number;
  UserId?: string | number;
  exp?: number;
  iat?: number;
}

export function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2 || !parts[1]) {
      return null;
    }

    // Replace base64url chars with base64 chars
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    return JSON.parse(jsonPayload) as JwtPayload;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string | null): boolean {
  if (!token) return true;

  const payload = decodeJwt(token);
  if (!payload || !payload.exp) {
    // If no exp field or invalid payload, treat as expired/invalid
    return true;
  }

  // exp is in seconds, Date.now() is in milliseconds
  // buffer 5 seconds to prevent edge-case race conditions
  const currentTime = Math.floor(Date.now() / 1000);
  return currentTime >= payload.exp - 5;
}

export function getToken(): string | null {
  const token = localStorage.getItem('token');
  if (!token) {
    return null;
  }

  if (isTokenExpired(token)) {
    clearToken();
    return null;
  }

  return token;
}

export function setToken(token: string) {
  localStorage.setItem('token', token);
}

export function clearToken() {
  localStorage.removeItem('token');
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}

export function getCurrentUserId(): string | null {
  const token = getToken();
  if (!token) {
    return null;
  }

  const payload = decodeJwt(token);
  if (!payload) {
    return null;
  }

  const userId = payload.userId ?? payload.UserId;
  return userId ? String(userId) : null;
}
