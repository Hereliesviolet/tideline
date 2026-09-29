// src/contexts/AuthContext.tsx
// Auth-State-Management mit React Context

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { getCurrentUser, User } from "../lib/auth";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  logout: () => void;
  refreshUser: () => Promise<void>; // Neue Funktion zum Aktualisieren des Users
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Beim Mount: Prüfen ob Token vorhanden und User laden
    const token = localStorage.getItem("auth_token");
    if (token) {
      getCurrentUser()
        .then((userData) => {
          // Debug-Logging entfernt: Vermeidet laute Konsolen-Ausgaben im Produktivbetrieb
          setUser(userData);
        })
        .catch(() => {
          // Token ungültig, entfernen
          localStorage.removeItem("auth_token");
          setUser(null);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  // Heartbeat: Regelmäßig Online-Status aktualisieren
  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem("auth_token");
    if (!token) return;

    // Heartbeat-Funktion
    const sendHeartbeat = async () => {
      try {
        await fetch("/api/auth/heartbeat", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
      } catch (error) {
        console.error("Heartbeat failed:", error);
      }
    };

    // Sofortiger Heartbeat beim Mount
    sendHeartbeat();

    // Dann alle 60 Sekunden
    const intervalId = setInterval(sendHeartbeat, 60 * 1000);

    return () => clearInterval(intervalId);
  }, [user]);

  // HINWEIS (Q-05, behoben): Früher wurde hier beim Tab-Schließen ein
  // navigator.sendBeacon("/api/auth/logout") gesendet. Das konnte jedoch keinen
  // Authorization-Header mitschicken und wurde serverseitig immer mit 401 abgelehnt –
  // die Session-Dauer ging dadurch für alle Nutzer verloren, die nicht explizit
  // ausloggten. Die Session-Zeit wird jetzt serverseitig über den 60-Sekunden-Heartbeat
  // (POST /api/auth/heartbeat) fortgeschrieben und ist damit unabhängig vom Logout.

  const logout = async () => {
    // Backend-API aufrufen um Session-Dauer zu speichern
    const token = localStorage.getItem("auth_token");
    if (token) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
      } catch (error) {
        console.error("Logout API call failed:", error);
        // Trotzdem lokalen Logout durchführen
      }
    }
    
    // Lokales Cleanup
    localStorage.removeItem("auth_token");
    setUser(null);
  };

  const refreshUser = async () => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const userData = await getCurrentUser();
      // Debug-Logging entfernt: Vermeidet laute Konsolen-Ausgaben im Produktivbetrieb
      setUser(userData);
    } catch (error) {
      console.error('[AuthContext] Failed to refresh user:', error);
      localStorage.removeItem("auth_token");
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        setUser,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

