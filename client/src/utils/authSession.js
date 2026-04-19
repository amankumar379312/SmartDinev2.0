import { clearWorkflowClientState } from "./workflowSession";

const TOKEN_KEY = "token";
const USER_KEY = "user";
const ROLE_KEY = "role";
const RESUME_ROUTE_KEY = "resumeRoute";

const AUTH_PATHS = new Set([
  "/login",
  "/login-admin",
  "/login-cw",
  "/signup",
  "/signup-admin",
  "/signup-staff",
]);

function decodeBase64Url(input) {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4 || 4)) % 4);
  return atob(padded);
}

function clearBrowserCookies() {
  const cookies = String(document.cookie || "")
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean);

  const hostnameParts = window.location.hostname.split(".").filter(Boolean);
  const domains = [window.location.hostname];
  for (let index = 1; index < hostnameParts.length - 1; index += 1) {
    domains.push(`.${hostnameParts.slice(index).join(".")}`);
  }

  cookies.forEach((cookie) => {
    const [name] = cookie.split("=");
    if (!name) return;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    domains.forEach((domain) => {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${domain}`;
    });
  });
}

export function parseJwt(token) {
  try {
    const [, payload] = String(token || "").split(".");
    if (!payload) return null;
    return JSON.parse(decodeBase64Url(payload));
  } catch {
    return null;
  }
}

export function normalizeRole(role) {
  const value = String(role || "user").toLowerCase();
  if (value === "admin") return "admin";
  if (value === "cook" || value === "waiter" || value === "staff" || value === "chef") return "staff";
  return "user";
}

export function isTokenExpired(token) {
  const payload = parseJwt(token);
  if (!payload?.exp) return true;
  return payload.exp * 1000 <= Date.now() + 5000;
}

export function getStoredSession() {
  const token = localStorage.getItem(TOKEN_KEY);
  const rawUser = localStorage.getItem(USER_KEY);
  if (!token || isTokenExpired(token)) {
    clearSession({ clearResumeRoute: false });
    return null;
  }

  try {
    const user = rawUser ? JSON.parse(rawUser) : null;
    if (!user) {
      clearSession({ clearResumeRoute: false });
      return null;
    }
    return { token, user };
  } catch {
    clearSession({ clearResumeRoute: false });
    return null;
  }
}

export function storeSession({ token, user }) {
  const previousSession = getStoredSession();
  const previousIdentity = previousSession?.user?.email || previousSession?.user?._id || null;
  const nextIdentity = user?.email || user?._id || null;

  if (previousIdentity && nextIdentity && previousIdentity !== nextIdentity) {
    clearWorkflowClientState();
  }

  const hydratedUser = {
    ...user,
    role: user?.role || parseJwt(token)?.role || "user",
  };
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(hydratedUser));
  localStorage.setItem(ROLE_KEY, hydratedUser.role);
  return hydratedUser;
}

export function clearSession(options = {}) {
  const { clearResumeRoute = true } = options;
  clearWorkflowClientState();
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem("authToken");
  sessionStorage.clear();
  clearBrowserCookies();
  if (clearResumeRoute) {
    localStorage.removeItem(RESUME_ROUTE_KEY);
  }
}

export function shouldTrackRoute(pathname) {
  return Boolean(pathname) && pathname !== "/" && !AUTH_PATHS.has(pathname);
}

export function inferRoleScopeFromPath(pathname) {
  if (pathname === "/admin-dashboard" || pathname === "/login-admin" || pathname === "/signup-admin") {
    return "admin";
  }
  if (pathname === "/cook-dashboard" || pathname === "/waiter-dashboard" || pathname === "/login-cw" || pathname === "/signup-staff") {
    return "staff";
  }
  return "user";
}

export function setResumeRoute(route) {
  if (!route?.pathname || !shouldTrackRoute(route.pathname)) return;
  localStorage.setItem(RESUME_ROUTE_KEY, JSON.stringify(route));
}

export function getResumeRoute() {
  try {
    const raw = localStorage.getItem(RESUME_ROUTE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.pathname) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearResumeRoute() {
  localStorage.removeItem(RESUME_ROUTE_KEY);
}

export function getDefaultRouteForRole(role) {
  const normalized = String(role || "").toLowerCase();
  if (normalized === "admin") return "/admin-dashboard";
  if (normalized === "cook") return "/cook-dashboard";
  if (normalized === "waiter") return "/waiter-dashboard";
  if (normalizeRole(normalized) === "staff") return "/TableSelector";
  return "/TableSelector";
}

export function getLoginPathForRoleScope(roleScope) {
  if (roleScope === "admin") return "/login-admin";
  if (roleScope === "staff") return "/login-cw";
  return "/login";
}

export function resolveResumeTarget(user) {
  const roleScope = normalizeRole(user?.role);
  const resumeRoute = getResumeRoute();
  if (resumeRoute?.roleScope === roleScope && shouldTrackRoute(resumeRoute.pathname)) {
    return resumeRoute;
  }
  return {
    pathname: getDefaultRouteForRole(user?.role),
    search: "",
    hash: "",
    state: null,
    roleScope,
  };
}
