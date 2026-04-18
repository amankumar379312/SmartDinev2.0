import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import API from "../api";
import {
  clearSession,
  getStoredSession,
  normalizeRole,
  storeSession,
} from "../utils/authSession";
import { clearWorkflowClientState, hydrateWorkflowClientState } from "../utils/workflowSession";

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => getStoredSession());
  const [workflow, setWorkflow] = useState(null);
  const [workflowReady, setWorkflowReady] = useState(() => !getStoredSession()?.token);

  useEffect(() => {
    const syncSession = (event) => {
      if (event.storageArea !== localStorage) return;
      if (!["token", "user", "role", "resumeRoute", "authToken"].includes(event.key || "")) return;
      setSession(getStoredSession());
    };

    window.addEventListener("storage", syncSession);
    return () => window.removeEventListener("storage", syncSession);
  }, []);

  const login = useCallback(({ token, user }) => {
    const hydratedUser = storeSession({ token, user });
    setSession({ token, user: hydratedUser });
    return hydratedUser;
  }, []);

  const refreshWorkflow = useCallback(async () => {
    const activeSession = getStoredSession();
    if (!activeSession?.token) {
      setWorkflow(null);
      clearWorkflowClientState();
      setWorkflowReady(true);
      return null;
    }

    try {
      const { data } = await API.get("/workflow/current");
      const nextWorkflow = data?.workflow || null;
      setWorkflow(nextWorkflow);
      if (nextWorkflow) {
        hydrateWorkflowClientState(nextWorkflow);
      }
      setWorkflowReady(true);
      return nextWorkflow;
    } catch (error) {
      console.error("Failed to refresh workflow", error);
      setWorkflow(null);
      setWorkflowReady(true);
      return null;
    }
  }, []);

  const logout = useCallback(async (options) => {
    const activeSession = getStoredSession();

    if (activeSession?.token) {
      try {
        await API.delete("/workflow/current", {
          headers: { Authorization: `Bearer ${activeSession.token}` },
        });
      } catch (error) {
        console.error("Failed to clear workflow during logout", error);
      }
    }

    clearSession(options);
    setSession(null);
    setWorkflow(null);
    setWorkflowReady(true);
  }, []);

  const setUser = useCallback((nextUser) => {
    setSession((current) => {
      if (!current?.token) return current;
      const resolvedUser = typeof nextUser === "function" ? nextUser(current.user) : nextUser;
      const hydratedUser = storeSession({
        token: current.token,
        user: {
          ...resolvedUser,
          role: resolvedUser?.role || current.user?.role || "user",
        },
      });
      return { token: current.token, user: hydratedUser };
    });
  }, []);

  useEffect(() => {
    if (!session?.token) {
      setWorkflow(null);
      setWorkflowReady(true);
      return;
    }
    setWorkflowReady(false);
    refreshWorkflow();
  }, [refreshWorkflow, session?.token]);

  const value = useMemo(() => ({
    user: session?.user || null,
    token: session?.token || null,
    isAuthenticated: Boolean(session?.token && session?.user),
    isSessionReady: workflowReady,
    roleScope: normalizeRole(session?.user?.role),
    workflow,
    login,
    logout,
    setUser,
    refreshWorkflow,
    setWorkflow,
  }), [login, logout, refreshWorkflow, session, setUser, workflow, workflowReady]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
