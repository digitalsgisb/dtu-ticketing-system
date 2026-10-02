import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, json, setCsrf } from "./api";
import { disablePush, getPushStatus } from "./pushNotifications";

export type User = {
  id: number;
  username: string;
  name: string;
  email: string | null;
  role: "admin" | "lead" | "member";
  language: "en" | "ms";
};

type AuthValue = {
  user: User | null;
  loading: boolean;
  mustChangePassword: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const refresh = async () => {
    try {
      const result = await api<{ user: User; csrfToken: string; mustChangePassword: boolean }>("/api/auth/me");
      setCsrf(result.csrfToken);
      setUser(result.user);
      setMustChangePassword(result.mustChangePassword);
    } catch {
      setUser(null);
      setCsrf("");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    if (!user) return;
    void getPushStatus(user.id).catch(() => {
      localStorage.removeItem(`dtu-background-push-${user.id}`);
    });
  }, [user?.id]);

  const login = async (username: string, password: string) => {
    const result = await api<{ user: User; csrfToken: string; mustChangePassword: boolean }>("/api/auth/login", json("POST", { username, password }));
    setCsrf(result.csrfToken);
    setUser(result.user);
    setMustChangePassword(result.mustChangePassword);
  };

  const logout = async () => {
    if (user) {
      try {
        await disablePush(user.id);
      } catch { /* Logout still proceeds if push cleanup fails. */ }
    }
    await api("/api/auth/logout", json("POST"));
    setUser(null);
    setCsrf("");
  };

  return <AuthContext.Provider value={{ user, loading, mustChangePassword, login, logout, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing");
  return value;
}
