export function getToken(): string | null {
  return localStorage.getItem('token');
}

export function clearToken() {
  localStorage.removeItem('token');
}

export function getCurrentUserId(): string | null {
  const token = getToken();

  if (!token) {
    return null;
  }

  try {
    const [, payload] = token.split('.');

    if (!payload) {
      return null;
    }

    const decoded = JSON.parse(window.atob(payload)) as {
      userId?: string | number;
      UserId?: string | number;
    };

    const userId = decoded.userId ?? decoded.UserId;
    return userId ? String(userId) : null;
  } catch {
    return null;
  }
}
