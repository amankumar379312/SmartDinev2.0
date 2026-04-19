import React, { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { AuthContext } from "../context/AuthContext";
import { getLoginPathForRoleScope } from "../utils/authSession";

export default function LogoutButton({ className = "", label = "Logout" }) {
  const { logout, roleScope } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = async () => {
    const loginPath = getLoginPathForRoleScope(roleScope);
    await logout();
    navigate(loginPath, { replace: true });
    window.location.replace(loginPath);
  };

  return (
    <button
      onClick={handleLogout}
      className={className}
      title="Log out"
      aria-label="Log out"
      type="button"
    >
      <LogOut size={16} />
      {label}
    </button>
  );
}
