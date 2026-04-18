// src/pages/SmartDineLogin.jsx

import React, { useState, useContext } from "react";
import {
  Utensils,
  Mail,
  Lock,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff
} from "lucide-react";

import API from "../api";
import { AuthContext } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { getDefaultRouteForRole } from "../utils/authSession";
import { getWorkflowRouteTarget, toPath } from "../utils/workflowSession";
import AnimatedBackground from "../components/AnimatedBackground";

const SmartDineLogin = () => {
  // --- Auth State ---
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, refreshWorkflow } = useContext(AuthContext);
  const navigate = useNavigate();

  // --- UI State ---
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("Login Failed");
  const [modalMessage, setModalMessage] = useState("");

  const hideModal = () => setModalOpen(false);

  // 🔐 LOGIN LOGIC
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setIsSuccess(false);

    try {
      const res = await API.post("/auth/login", { email, password });
      const { token, user } = res.data;
      const hydratedUser = login({ token, user });
      const workflow = await refreshWorkflow();
      const workflowTarget = getWorkflowRouteTarget(workflow);

      setIsSuccess(true);
      setModalOpen(false);
      navigate(toPath(workflowTarget) || getDefaultRouteForRole(hydratedUser.role), {
        replace: true,
        state: workflowTarget?.state || null,
      });
    } catch (err) {
      console.error(err);
      setIsSuccess(false);
      setModalTitle("Authentication Failed");
      setModalMessage("Oops! User does not exist. Please enter valid credentials.");
      setModalOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen overflow-hidden font-sans antialiased text-white relative">
      <AnimatedBackground />

      <div className="flex items-center justify-center w-full h-screen relative z-10 px-4">
        <div className="w-full max-w-[420px] animate-fade-in-up">

          <div className="bg-gray-900/60 backdrop-blur-xl rounded-3xl shadow-2xl p-8 sm:p-10 border border-white/10 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 via-orange-400 to-orange-600" />

            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg shadow-orange-500/20 mb-6 transform rotate-3 hover:rotate-6 transition-transform">
                <Utensils className="w-8 h-8 text-white" />
              </div>

              <h1 className="text-3xl font-black tracking-tight text-white mb-2">
                SmartDine
              </h1>
              <p className="text-gray-400 text-sm font-medium">
                Experience crafted for you.
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>

              {/* EMAIL */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-gray-400 tracking-wider ml-1">
                  Email
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-500 group-focus-within:text-orange-500 transition-colors" />
                  </div>
                  <input
                    type="email"
                    placeholder="Enter your email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-11 pr-4 py-3.5 bg-gray-800/50 border border-gray-700 text-white placeholder-gray-500 rounded-xl focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all outline-none text-sm font-medium"
                  />
                </div>
              </div>

              {/* PASSWORD */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-gray-400 tracking-wider ml-1">
                  Password
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-500 group-focus-within:text-orange-500 transition-colors" />
                  </div>

                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-12 py-3.5 bg-gray-800/50 border border-gray-700 text-white placeholder-gray-500 rounded-xl focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all outline-none text-sm font-medium [&::-webkit-password-reveal-button]:hidden [&::-ms-reveal]:hidden"
                  />

                  {/* CUSTOM EYE BUTTON */}
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-1 right-1 px-2 flex items-center
                      bg-gray-700/40 hover:bg-amber-500/20
                      rounded-lg transition-all text-amber-300 cursor-pointer"
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* REMEMBER + FORGOT PASSWORD */}
              <div className="flex items-center justify-between text-sm">

                <label className="flex items-center cursor-pointer group">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-orange-500 focus:ring-offset-gray-900 focus:ring-orange-500 transition-colors"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  <span className="ml-2 text-gray-400 group-hover:text-gray-300 transition-colors">
                    Remember me
                  </span>
                </label>

                {/* UPDATED FORGOT PASSWORD BUTTON */}
                <button
                  type="button"
                  className="px-3 py-1 rounded-lg
                    bg-amber-500/10 hover:bg-amber-500/20
                    text-amber-300 font-semibold transition-all"
                >
                  Forgot Password?
                </button>
              </div>

              {/* SUBMIT */}
              <button
                type="submit"
                disabled={isLoading}
                className={`w-full flex items-center justify-center gap-2 py-4 px-6 rounded-xl shadow-lg font-bold text-white transition-all duration-200 transform active:scale-[0.98] ${isLoading
                    ? "opacity-80 cursor-wait"
                    : isSuccess
                      ? "bg-green-600 hover:bg-green-500 shadow-green-900/20"
                      : "bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 shadow-orange-900/20"
                  }`}
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : isSuccess ? (
                  <span>Success!</span>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>

            {/* FOOTER */}
            <div className="mt-8 pt-6 border-t border-white/10 text-center">
              <p className="text-gray-400 text-sm mb-3">
                Don't have an account?{" "}
                <Link
                  to="/signup"
                  className="text-white font-semibold hover:text-orange-500 transition-colors"
                >
                  Create Account
                </Link>
              </p>
              <div className="flex justify-center gap-4 text-xs text-gray-500">
                <Link
                  to="/login-admin"
                  className="hover:text-gray-300 transition-colors"
                >
                  Admin Access
                </Link>
                <span>•</span>
                <Link
                  to="/login-cw"
                  className="hover:text-gray-300 transition-colors"
                >
                  Staff Portal
                </Link>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ERROR MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-gray-900 border border-white/10 p-6 rounded-2xl shadow-2xl w-full max-w-xs text-center relative">
            <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">{modalTitle}</h3>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              {modalMessage}
            </p>
            <button
              onClick={hideModal}
              className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-xl transition-colors border border-gray-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default SmartDineLogin;
