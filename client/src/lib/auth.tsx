import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { setUnauthorizedHandler } from "@/lib/queryClient";

export interface AuthUser {
  id: string;
  name: string;
}

export type LoginMode = "shared" | "users";

interface LoginInput {
  password: string;
  name?: string;
  username?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  loginMode: LoginMode;
  login: (input: LoginInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function readBody(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loginMode, setLoginMode] = useState<LoginMode>("shared");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
      const body = await readBody(res);
      setLoginMode(body.login?.mode === "users" ? "users" : "shared");
      setUser(res.ok && body.user ? body.user : null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    void refresh();
  }, [refresh]);

  const login = useCallback(async (input: LoginInput) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = await readBody(res);
    if (!res.ok || !body.user) {
      throw new Error(body.message || "Login failed");
    }
    setUser(body.user);
    return body.user as AuthUser;
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loginMode, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Evaluator id recorded on scores and other judge-owned writes. */
export function useEvaluatorId(): string {
  const { user } = useAuth();
  return user?.id ?? "";
}
