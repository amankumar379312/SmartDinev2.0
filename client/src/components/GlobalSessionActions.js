import React, { useContext } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { AuthContext } from "../context/AuthContext";
import { getLoginPathForRoleScope } from "../utils/authSession";

const HIDDEN_PATHS = new Set([
  "/login",
  "/login-admin",
  "/login-cw",
  "/signup",
  "/signup-admin",
  "/signup-staff",
]);

export default function GlobalSessionActions() {
  const { isAuthenticated, logout, roleScope } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();

  if (!isAuthenticated || HIDDEN_PATHS.has(location.pathname)) {
    return null;
  }

  const handleLogout = async () => {
    const loginPath = getLoginPathForRoleScope(roleScope);
    await logout();
    navigate(loginPath, { replace: true });
    window.location.replace(loginPath);
  };

  return (
    <button
      onClick={handleLogout}
      className="fixed top-4 right-6 z-[70] inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-lg backdrop-blur-md transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
      title="Log out"
      aria-label="Log out"
    >
      <LogOut size={16} />
      Logout
    </button>
  );
}
