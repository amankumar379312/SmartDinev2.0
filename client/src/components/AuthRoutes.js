import React, { useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import {
  getDefaultRouteForRole,
  getLoginPathForRoleScope,
  normalizeRole,
  resolveResumeTarget,
  setResumeRoute,
} from "../utils/authSession";
import { getWorkflowRouteTarget, toPath } from "../utils/workflowSession";

export function RedirectIfAuthenticated({ children }) {
  const { isAuthenticated, isSessionReady, user, workflow } = useContext(AuthContext);

  if (!isSessionReady) return null;
  if (!isAuthenticated) return children;

  const target = getWorkflowRouteTarget(workflow) || resolveResumeTarget(user);
  return <Navigate to={toPath(target) || getDefaultRouteForRole(user?.role)} replace state={target?.state || null} />;
}

export function ProtectedRoute({ children, roleScope = "user", allowedRoles = null }) {
  const { isAuthenticated, isSessionReady, roleScope: currentRoleScope, user } = useContext(AuthContext);
  const location = useLocation();

  if (!isSessionReady) return null;

  if (!isAuthenticated) {
    setResumeRoute({
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      state: location.state ?? null,
      roleScope,
    });
    return <Navigate to={getLoginPathForRoleScope(roleScope)} replace />;
  }

  if (roleScope && normalizeRole(user?.role) !== roleScope) {
    const fallback = getDefaultRouteForRole(user?.role);
    return <Navigate to={fallback || getLoginPathForRoleScope(currentRoleScope)} replace />;
  }

  if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
    const currentRole = String(user?.role || "").toLowerCase();
    if (!allowedRoles.map((role) => String(role).toLowerCase()).includes(currentRole)) {
      const fallback = getDefaultRouteForRole(user?.role);
      return <Navigate to={fallback || getLoginPathForRoleScope(currentRoleScope)} replace />;
    }
  }

  return children;
}
