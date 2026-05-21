import React, { createContext, useContext, useEffect } from "react";
import { useGetMe, User } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import clientLogger from "@/lib/client-logger";
import { playSound } from "@/lib/sound-effects";
import { getBaseApiPath } from "@/lib/api-url";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, isError } = useGetMe();

  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isError && location !== "/login") {
      setLocation("/login");
    }
  }, [isLoading, isError, location, setLocation]);

  const logout = () => {
    const currentUser = user?.email || "unknown";
    clientLogger.logUserAuth("logout", currentUser);
    const token = localStorage.getItem("token");
    void (async () => {
      try {
        const logoutUrl = `${getBaseApiPath()}/auth/logout`;
        await fetch(logoutUrl, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          credentials: "include",
        });
      } catch (err) {
        clientLogger.error("Logout API call failed", err);
      }
      await playSound("logout");
      localStorage.removeItem("token");
      window.setTimeout(() => {
        window.location.href = "/login";
      }, 900);
    })();
  };

  return (
    <AuthContext.Provider value={{ user: user || null, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
