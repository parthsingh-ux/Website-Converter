"use client";

import React, { useState } from "react";
import { Icon } from "@iconify/react";

export default function LoginScreen({ onLoginSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    setTimeout(() => {
      if (username.trim() === "parthsingh101" && password === "adaan101") {
        localStorage.setItem("wcs_authenticated", "true");
        localStorage.setItem(
          "userInfo",
          JSON.stringify({
            email: "parthsingh101@adaan.com",
            username: "parthsingh101",
            role: "admin",
          })
        );
        if (onLoginSuccess) onLoginSuccess();
      } else {
        setError("Invalid username or password");
        setLoading(false);
      }
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-[#030914] text-slate-100 overflow-hidden font-sans">
      {/* Deep blue and subtle warm glow backdrop matching the screenshot */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[550px] bg-[#0A4D8C]/35 rounded-full blur-[160px]" />
        <div className="absolute top-1/2 right-[18%] -translate-y-1/2 w-[400px] h-[400px] bg-[#8C760A]/18 rounded-full blur-[140px]" />
      </div>

      <div className="relative w-full max-w-5xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-12 z-10">
        {/* Left Side - Typography Branding */}
        <div className="w-full md:w-1/2 text-left space-y-4">
          <div className="space-y-0.5">
            <h1 className="text-6xl md:text-7xl font-extrabold tracking-tight text-white uppercase">
              Website
            </h1>
            <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-[#0088FF] uppercase">
              Converter
            </h2>
          </div>
          <p className="text-slate-400 text-xs md:text-sm leading-relaxed max-w-md">
            Where AI efficiency meets human excellence. Website Converter bridges the production gap, providing a robust layer to clean, validate, and verify work and ensuring reports are accurate before billing.
          </p>
        </div>

        {/* Right Side - Clean White Login Card matching screenshot */}
        <div className="w-full md:w-[380px] bg-white rounded-2xl shadow-2xl p-7 text-slate-900 border border-slate-100">
          {/* Brand Logo */}
          <div className="mb-5 flex items-center justify-start">
            <img src="/logo.png" alt="Adaan" className="h-9 object-contain" />
          </div>

          <h3 className="text-xl font-bold text-slate-900 mb-5">Login</h3>

          {error && (
            <div className="mb-4 p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs flex items-center gap-2">
              <Icon icon="solar:danger-triangle-bold" width="16" height="16" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="parthsingh101@adaan.com"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#0070F3] focus:ring-1 focus:ring-[#0070F3] transition-all pr-9"
                />
                <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-slate-400">
                  <Icon icon="lucide:mail" width="16" height="16" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••••••"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#0070F3] focus:ring-1 focus:ring-[#0070F3] transition-all pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <Icon
                    icon={showPassword ? "lucide:eye-off" : "lucide:eye"}
                    width="16"
                    height="16"
                  />
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-3 py-2.5 px-4 bg-[#0070F3] hover:bg-[#0060DF] text-white font-semibold text-xs rounded-lg shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <span>Logging in...</span>
              ) : (
                <span>Login</span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
