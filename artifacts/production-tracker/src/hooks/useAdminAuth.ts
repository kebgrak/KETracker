import { useState, useEffect, useCallback } from "react";

export type AuthState = "loading" | "authenticated" | "unauthenticated";
export type UserRole = "admin" | "moderator" | null;

export function useAdminAuth() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [role, setRole] = useState<UserRole>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/status`, {
        credentials: "include",
      });
      const body = await res.json() as { authenticated: boolean; role: UserRole };
      if (body.authenticated) {
        setAuthState("authenticated");
        setRole(body.role);
      } else {
        setAuthState("unauthenticated");
        setRole(null);
      }
    } catch {
      setAuthState("unauthenticated");
      setRole(null);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const logout = useCallback(async () => {
    await fetch(`${import.meta.env.BASE_URL}api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    setAuthState("unauthenticated");
    setRole(null);
  }, []);

  const onLoginSuccess = useCallback((newRole: UserRole) => {
    setAuthState("authenticated");
    setRole(newRole);
  }, []);

  return { authState, role, onLoginSuccess, logout, refetch: check };
}
