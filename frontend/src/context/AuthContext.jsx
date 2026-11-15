import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../api/axios";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const response = await api.get("/auth/me");
      if (response.data && response.data.authenticated && response.data.user) {
        setUser(response.data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Global response interceptor for session expiration
  useEffect(() => {
    const interceptor = api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (
          error.response &&
          error.response.status === 401 &&
          error.config &&
          !error.config.url.includes("/auth/login") &&
          !error.config.url.includes("/auth/me") &&
          !error.config.url.includes("/verify-password")
        ) {
          setUser(null);
        }
        return Promise.reject(error);
      }
    );

    return () => {
      api.interceptors.response.eject(interceptor);
    };
  }, []);

  const login = async (email, password) => {
    const response = await api.post("/auth/login", { email, password });
    if (response.data && response.data.success && response.data.user) {
      setUser(response.data.user);
      return response.data;
    }
    throw new Error(response.data?.message || "Login failed");
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      console.error("Logout request error:", err);
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, checkAuth, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
