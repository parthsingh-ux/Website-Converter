"use client";

import React, { useState, useEffect } from "react";
import { Icon } from "@iconify/react";

export default function WpPushModal({ isOpen, onClose, bundle }) {
  const [wpUrl, setWpUrl] = useState("");
  const [username, setUsername] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [pageTitle, setPageTitle] = useState("");
  const [pageStatus, setPageStatus] = useState("publish");
  const [createPage, setCreatePage] = useState(true);
  const [rememberCreds, setRememberCreds] = useState(true);

  const [isPublishing, setIsPublishing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [publishResult, setPublishResult] = useState(null);

  // Load saved credentials & pre-fill page title
  useEffect(() => {
    if (isOpen) {
      if (typeof window !== "undefined") {
        const savedUrl = localStorage.getItem("gcb_wpUrl") || "";
        const savedUser = localStorage.getItem("gcb_username") || "";
        if (savedUrl) setWpUrl(savedUrl);
        if (savedUser) setUsername(savedUser);
      }
      setPageTitle(bundle?.title || "Converted Page");
      setPublishResult(null);
      setErrorMsg("");
    }
  }, [isOpen, bundle]);

  if (!isOpen) return null;

  const handlePublish = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (!wpUrl.trim()) {
      setErrorMsg("Please enter your WordPress Site URL.");
      return;
    }
    if (!username.trim() || !appPassword.trim()) {
      setErrorMsg("Please enter your WordPress Username and Application Password.");
      return;
    }
    if (!bundle) {
      setErrorMsg("No conversion bundle found. Please convert HTML first.");
      return;
    }

    let cleanUrl = wpUrl.trim().replace(/\/$/, "");
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = "https://" + cleanUrl;
    }

    if (rememberCreds && typeof window !== "undefined") {
      localStorage.setItem("gcb_wpUrl", cleanUrl);
      localStorage.setItem("gcb_username", username.trim());
    }

    setIsPublishing(true);

    try {
      const payload = {
        ...bundle,
        createPage,
        pageTitle: pageTitle.trim() || bundle?.title || "Converted Page",
        pageStatus,
      };

      const response = await fetch("/api/push-wp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          wpUrl: cleanUrl,
          username: username.trim(),
          appPassword: appPassword.trim(),
          payload,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || data.message || `Publish failed with HTTP status ${response.status}`
        );
      }

      setPublishResult(data);
    } catch (err) {
      console.error("WordPress publish error:", err);
      setErrorMsg(err.message || "Failed to push to WordPress. Ensure Gutenberg Converter Runtime plugin is active.");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in text-gray-900">
        
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-500 text-white flex items-center justify-center shadow-sm">
              <Icon icon="solar:rocket-bold" width="18" height="18" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">Push to WordPress</h3>
              <p className="text-xs text-gray-500">Publish Pattern & Create Page in 1-Click</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Icon icon="mingcute:close-line" width="20" height="20" />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="p-6">
          {publishResult ? (
            /* SUCCESS STATE */
            <div className="flex flex-col items-center text-center py-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
                <Icon icon="solar:check-circle-bold" width="32" height="32" />
              </div>
              <h4 className="text-lg font-bold text-gray-900 mb-1">Successfully Published!</h4>
              <p className="text-xs text-gray-600 mb-6 max-w-sm">
                Your pattern and responsive styles have been saved to WordPress, and the new page is ready.
              </p>

              <div className="w-full flex flex-col gap-3">
                {publishResult.pageUrl && (
                  <a
                    href={publishResult.pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-primary-500 hover:bg-primary-600 text-white font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all text-sm"
                  >
                    <Icon icon="solar:globus-bold" width="18" height="18" />
                    <span>View Published Page</span>
                  </a>
                )}
                {publishResult.pageEditUrl ? (
                  <a
                    href={publishResult.pageEditUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 border border-gray-300 transition-all text-sm"
                  >
                    <Icon icon="solar:pen-bold" width="18" height="18" />
                    <span>Edit Page in Gutenberg</span>
                  </a>
                ) : publishResult.editUrl && (
                  <a
                    href={publishResult.editUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 border border-gray-300 transition-all text-sm"
                  >
                    <Icon icon="solar:pen-bold" width="18" height="18" />
                    <span>Edit Pattern in WordPress</span>
                  </a>
                )}
              </div>

              <button
                onClick={onClose}
                className="mt-6 text-xs text-gray-500 hover:text-gray-800 underline"
              >
                Close Window
              </button>
            </div>
          ) : (
            /* FORM STATE */
            <form onSubmit={handlePublish} className="space-y-4">
              
              <div className="p-3 bg-blue-50/80 border border-blue-100 rounded-xl flex items-center justify-between text-xs text-blue-900">
                <div className="flex items-center gap-2">
                  <Icon icon="solar:info-square-bold" width="18" height="18" className="text-blue-500 flex-shrink-0" />
                  <span>Requires <strong>Runtime Plugin v2.1</strong> on target site.</span>
                </div>
                <a
                  href="/downloads/gutenberg-converter-runtime.zip"
                  download
                  className="font-semibold text-primary-600 hover:text-primary-700 underline flex items-center gap-1 flex-shrink-0"
                >
                  <Icon icon="solar:download-minimalistic-bold" width="14" height="14" />
                  <span>Download Zip</span>
                </a>
              </div>

              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-600 flex items-start gap-2">
                  <Icon icon="solar:danger-triangle-bold" width="18" height="18" className="flex-shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  WordPress Site URL <span className="text-rose-500">*</span>
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://example.com"
                  value={wpUrl}
                  onChange={(e) => setWpUrl(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3.5 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Username <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3.5 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Application Password <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="xxxx xxxx xxxx xxxx"
                    value={appPassword}
                    onChange={(e) => setAppPassword(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3.5 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createPage}
                      onChange={(e) => setCreatePage(e.target.checked)}
                      className="w-4 h-4 rounded text-primary-500 focus:ring-primary-400"
                    />
                    <span className="text-xs font-semibold text-gray-800">
                      Create WordPress Page with Pattern
                    </span>
                  </label>
                </div>

                {createPage && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Page Title
                      </label>
                      <input
                        type="text"
                        value={pageTitle}
                        onChange={(e) => setPageTitle(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary-500"
                        placeholder="Page Title"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Status
                      </label>
                      <select
                        value={pageStatus}
                        onChange={(e) => setPageStatus(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-300 rounded-xl px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary-500"
                      >
                        <option value="publish">Publish</option>
                        <option value="draft">Draft</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={rememberCreds}
                    onChange={(e) => setRememberCreds(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-primary-500"
                  />
                  <span>Remember Site URL & Username</span>
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPublishing}
                    className="px-4 py-2 text-xs font-semibold text-white bg-primary-500 hover:bg-primary-600 rounded-xl shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Icon icon="solar:rocket-bold" width="16" height="16" />
                    <span>{isPublishing ? "Publishing..." : "Push & Create Page"}</span>
                  </button>
                </div>
              </div>

            </form>
          )}
        </div>

      </div>
    </div>
  );
}
