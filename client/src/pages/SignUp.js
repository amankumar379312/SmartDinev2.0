// src/pages/Signup.jsx

import React, { useState } from "react";
import {
  Utensils,
  User,
  Phone,
  Mail,
  Lock,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
  CheckCircle
} from "lucide-react";

import API from "../api"; 
import { Link, useNavigate } from "react-router-dom";
import AnimatedBackground from "../components/AnimatedBackground";

const Signup = () => {
  const navigate = useNavigate();

  // --- Form State ---
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
  });

  // --- UI State ---
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // --- Modal State ---
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState("error"); // 'error' or 'success'
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");

  const hideModal = () => {
    setModalOpen(false);
    if (modalType === "success") {
      navigate("/login"); // Redirect to login on success dismissal
    }
  };

  // Handle Input Change
  const handleChange = (e) => {
    setForm({ ...form, [e.target.id]: e.target.value });
  };

  // 📝 HANDLE SIGNUP
  const handleSignup = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setIsSuccess(false);

    try {
      const response = await API.post("/auth/register", form);

      setIsSuccess(true);
      setModalType("success");
      setModalTitle("Account Created!");
      setModalMessage("Welcome to Smart Dine. You can now log in.");
      setModalOpen(true);
      
      // Clear form
      setForm({ name: "", phone: "", email: "", password: "" });

    } catch (err) {
      console.error(err);
      setIsSuccess(false);
      setModalType("error");
      setModalTitle("Signup Failed");
      setModalMessage(
        err?.response?.data?.message || "Server error, please try again later."
      );
      setModalOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen overflow-hidden font-sans antialiased text-white relative">
      <AnimatedBackground />

      {/* Main Container */}
      <div className="flex items-center justify-center w-full min-h-screen relative z-10 px-4 py-10">
        <div className="w-full max-w-[420px] animate-fade-in-up">

          <div className="bg-gray-900/60 backdrop-blur-xl rounded-3xl shadow-2xl p-8 sm:p-10 border border-white/10 relative overflow-hidden">
            {/* Gradient Top Bar */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600" />

            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/20 mb-6 transform rotate-3 hover:rotate-6 transition-transform">
                <Utensils className="w-8 h-8 text-white" />
              </div>

              <h1 className="text-3xl font-black tracking-tight text-white mb-2">
                Create Account
              </h1>
              <p className="text-gray-400 text-sm font-medium">
                Join Smart Dine today.
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSignup}>

              {/* NAME */}
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-gray-400 tracking-wider ml-1">
                  Full Name
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-500 group-focus-within:text-orange-500 transition-colors" />
                  </div>
                  <input
                    type="text"
                    id="name"
                    placeholder="Enter your full name"
                    required
                    value={form.name}
                    onChange={handleChange}
                    className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 text-white placeholder-gray-500 rounded-xl focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all outline-none text-sm font-medium"
                  />
                </div>
              </div>

              {/* PHONE */}
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-gray-400 tracking-wider ml-1">
                  Phone Number
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Phone className="h-5 w-5 text-gray-500 group-focus-within:text-orange-500 transition-colors" />
                  </div>
                  <input
                    type="tel"
                    id="phone"
                    placeholder="+1 (555) 000-0000"
                    required
                    value={form.phone}
                    onChange={handleChange}
                    className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 text-white placeholder-gray-500 rounded-xl focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all outline-none text-sm font-medium"
                  />
                </div>
              </div>

              {/* EMAIL */}
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-gray-400 tracking-wider ml-1">
                  Email Address
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-500 group-focus-within:text-orange-500 transition-colors" />
                  </div>
                  <input
                    type="email"
                    id="email"
                    placeholder="you@example.com"
                    required
                    value={form.email}
                    onChange={handleChange}
                    className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 text-white placeholder-gray-500 rounded-xl focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all outline-none text-sm font-medium"
                  />
                </div>
              </div>

              {/* PASSWORD */}
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-gray-400 tracking-wider ml-1">
                  Password
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-500 group-focus-within:text-orange-500 transition-colors" />
                  </div>

                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    placeholder="Create a strong password"
                    required
                    value={form.password}
                    onChange={handleChange}
                    // Prevent native browser eye icon
                    className="w-full pl-11 pr-12 py-3 bg-gray-800/50 border border-gray-700 text-white placeholder-gray-500 rounded-xl focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all outline-none text-sm font-medium [&::-webkit-password-reveal-button]:hidden [&::-ms-reveal]:hidden"
                  />

                  {/* Toggle Password Visibility */}
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-1 right-1 px-2 flex items-center 
                      bg-gray-700/40 hover:bg-orange-500/20 
                      rounded-lg transition-all text-orange-300 cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* SIGN UP BUTTON */}
              <button
                type="submit"
                disabled={isLoading}
                className={`w-full flex items-center justify-center gap-2 py-4 px-6 mt-4 rounded-xl shadow-lg font-bold text-white transition-all duration-200 transform active:scale-[0.98] ${isLoading
                    ? "opacity-80 cursor-wait"
                    : isSuccess
                      ? "bg-green-600 hover:bg-green-500 shadow-green-900/20"
                      : "bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 shadow-orange-900/20"
                  }`}
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Creating Account...</span>
                  </>
                ) : isSuccess ? (
                  <span>Success!</span>
                ) : (
                  <>
                    <span>Sign Up</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>

            {/* FOOTER */}
            <div className="mt-8 pt-6 border-t border-white/10 text-center">
              <p className="text-gray-400 text-sm">
                Already have an account?{" "}
                <Link
                  to="/login"
                  className="text-white font-semibold hover:text-orange-500 transition-colors"
                >
                  Login here
                </Link>
              </p>
            </div>

          </div>
        </div>
      </div>

      {/* RESULT MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-gray-900 border border-white/10 p-6 rounded-2xl shadow-2xl w-full max-w-xs text-center relative">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
              modalType === "success" ? "bg-green-500/10" : "bg-red-500/10"
            }`}>
              {modalType === "success" ? (
                <CheckCircle className="w-6 h-6 text-green-500" />
              ) : (
                <AlertCircle className="w-6 h-6 text-red-500" />
              )}
            </div>
            <h3 className="text-lg font-bold text-white mb-2">{modalTitle}</h3>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              {modalMessage}
            </p>
            <button
              onClick={hideModal}
              className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-xl transition-colors border border-gray-700"
            >
              {modalType === "success" ? "Go to Login" : "Try Again"}
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default Signup;