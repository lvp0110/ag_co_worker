import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as authApi from "../services/authApi.js";

const AuthContext = createContext(null);

/**
 * Авторизация только через внешний auth (cookie session).
 *
 * status:
 *   loading — идёт GET /auth/session
 *   authed  — есть user
 *   anon    — гость
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");
  const [loginModal, setLoginModal] = useState({ isOpen: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = authApi.readPersistedAuthUser();
      try {
        const data = await authApi.session();
        if (cancelled) return;
        if (data?.user) {
          authApi.persistAuthUser(data.user);
          setUser(data.user);
          setStatus("authed");
          return;
        }
      } catch {
        // сеть / 5xx
      }
      if (cancelled) return;
      // GitHub Pages: cookie-сессии нет, держим вход из sessionStorage.
      if (cached) {
        setUser(cached);
        setStatus("authed");
        return;
      }
      setUser(null);
      setStatus("anon");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      authApi.clearStoredAuthTokens();
      authApi.clearPersistedAuthUser();
      setUser(null);
      setStatus("anon");
      setLoginModal({ isOpen: true });
    };
    window.addEventListener("auth:unauthorized", onUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", onUnauthorized);
  }, []);

  const login = useCallback(async (credentials) => {
    const data = await authApi.login(credentials);
    authApi.persistAuthUser(data.user);
    setUser(data.user);
    setStatus("authed");
    setLoginModal({ isOpen: false });
    return data;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    authApi.clearPersistedAuthUser();
    setUser(null);
    setStatus("anon");
  }, []);

  const openLoginModal = useCallback(() => setLoginModal({ isOpen: true }), []);
  const closeLoginModal = useCallback(() => setLoginModal({ isOpen: false }), []);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthed: status === "authed",
      loginModal,
      login,
      logout,
      openLoginModal,
      closeLoginModal,
    }),
    [user, status, loginModal, login, logout, openLoginModal, closeLoginModal]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
};
