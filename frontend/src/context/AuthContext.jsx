import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SESSION_KEY } from '../utils/constants';
import { authService } from '../services/authService';

const AuthContext = createContext(null);
const VALID_ROLES = new Set(['student', 'mentor', 'admin']);
const SESSION_EXPIRED_EVENT = 'skilltrack:session-expired';

function tokenExpiry(token) {
  try {
    const encodedPayload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(encodedPayload.padEnd(Math.ceil(encodedPayload.length / 4) * 4, '=')));
    return Number.isFinite(payload.exp) ? payload.exp : 0;
  } catch {
    return 0;
  }
}

function validSession(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof value.token === 'string'
    && value.token
    && value.user
    && VALID_ROLES.has(value.user.role)
    && tokenExpiry(value.token) > Date.now() / 1000,
  );
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(() => {
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch (error) {
      console.error('Could not clear this tab session storage.', error);
    }
    setUser(null);
    setToken('');
  }, []);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(SESSION_KEY)
        || window.localStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (validSession(parsed)) {
          window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
          setUser(parsed.user);
          setToken(parsed.token);
        } else {
          window.sessionStorage.removeItem(SESSION_KEY);
        }
      }
      window.localStorage.removeItem(SESSION_KEY);
    } catch (error) {
      console.error('Could not restore the saved session.', error);
      try {
        window.sessionStorage.removeItem(SESSION_KEY);
        window.localStorage.removeItem(SESSION_KEY);
      } catch (storageError) {
        console.error('Could not clear an invalid saved session.', storageError);
      }
    } finally {
      setIsLoading(false);
    }

    const expireSession = () => clearSession();
    window.addEventListener(SESSION_EXPIRED_EVENT, expireSession);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expireSession);
  }, [clearSession]);

  useEffect(() => {
    if (!token) return undefined;
    const expiresAt = tokenExpiry(token) * 1000;
    const timeout = window.setTimeout(
      () => window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT)),
      Math.max(0, expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [token]);

  const authenticate = useCallback(async operation => {
    const session = await operation;
    if (!validSession(session)) {
      throw new Error('The server returned an invalid or expired session. Please sign in again.');
    }
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      throw new Error('Could not store the session in this tab. Please enable session storage and try again.');
    }
    setUser(session.user);
    setToken(session.token);
    return session.user;
  }, []);

  const login = useCallback(credentials => authenticate(authService.login(credentials)), [authenticate]);
  const register = useCallback(credentials => authenticate(authService.register(credentials)), [authenticate]);
  const logout = useCallback(() => clearSession(), [clearSession]);
  const value = useMemo(
    () => ({ user, isLoading, login, register, logout }),
    [user, isLoading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
