"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Icon } from "@iconify/react";
import WpPushModal from "./WpPushModal";

export default function GutenbergConverter() {
  const [pageTitle, setPageTitle] = useState("Converted Page");
  const [mediaPrefix, setMediaPrefix] = useState("");
  const [imageAssets, setImageAssets] = useState([]);
  const [htmlInput, setHtmlInput] = useState("");
  const [cssInput, setCssInput] = useState("");
  const [jsInput, setJsInput] = useState("");

  const [activeInputTab, setActiveInputTab] = useState("html");
  const [activeOutputTab, setActiveOutputTab] = useState("preview");

  const [isConverting, setIsConverting] = useState(false);
  const [statusText, setStatusText] = useState("Ready to convert.");
  const [engineBadgeText, setEngineBadgeText] = useState("Engine: Standby");
  const [blockCount, setBlockCount] = useState(0);

  const [result, setResult] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isWpModalOpen, setIsWpModalOpen] = useState(false);

  const fileInputRef = useRef(null);
  const imageFileInputRef = useRef(null);
  const previewIframeRef = useRef(null);
  const convertedIframeRef = useRef(null);

  // Helper to resolve preview images with uploaded data URIs
  const resolvePreviewImages = useCallback((text) => {
    if (!text || !imageAssets || imageAssets.length === 0) return text;
    let resolved = text;
    imageAssets.forEach((asset) => {
      if (!asset.filename || !asset.data) return;
      const escaped = asset.filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regexSrc = new RegExp(`(src=["'])([^"']*?${escaped})(["'])`, 'gi');
      const regexCss = new RegExp(`(url\\(\\s*["']?)([^"')]*?${escaped})(["']?\\s*\\))`, 'gi');
      resolved = resolved.replace(regexSrc, `$1${asset.data}$3`);
      resolved = resolved.replace(regexCss, `$1${asset.data}$3`);
    });
    return resolved;
  }, [imageAssets]);

  // Helper to build preview HTML markup
  const buildPreviewHtml = useCallback((markup, css) => {
    if (!markup) return "<html><body></body></html>";
    const resolvedMarkup = resolvePreviewImages(markup);
    const resolvedCss = resolvePreviewImages(css);
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
    ${resolvedCss || ""}
  </style>
</head>
<body>
  ${resolvedMarkup}
</body>
</html>`;
  }, [resolvePreviewImages]);

  // Update source preview when inputs change
  useEffect(() => {
    if (previewIframeRef.current) {
      previewIframeRef.current.srcdoc = buildPreviewHtml(htmlInput, cssInput);
    }
  }, [htmlInput, cssInput, imageAssets, buildPreviewHtml]);

  // Update converted preview when result changes
  useEffect(() => {
    if (convertedIframeRef.current) {
      if (result?.content && result?.patternCss) {
        convertedIframeRef.current.srcdoc = buildPreviewHtml(result.content, result.patternCss);
      } else {
        convertedIframeRef.current.srcdoc = `<!doctype html><html><body style="font-family:sans-serif;color:#64707C;padding:24px;"><p>Convert the current input to preview block markup.</p></body></html>`;
      }
    }
  }, [result, imageAssets, buildPreviewHtml]);

  // Load sample code
  const handleLoadSample = () => {
    setPageTitle("Responsive Hero");
    setHtmlInput(
      `<section class="hero">\n  <div class="wrap">\n    <h1>Your next chapter starts here.</h1>\n    <p>Edit this content in Gutenberg.</p>\n    <a class="btn" href="#contact">Contact us</a>\n  </div>\n</section>`
    );
    setCssInput(
      `.hero{background:#021528;color:#fff;padding:100px 24px;font-family:Figtree,sans-serif}.hero .wrap{max-width:900px;margin:auto}.hero h1{font-size:56px;margin:0 0 24px}.hero p{font-size:20px;color:#97A3AF}.hero .btn{display:inline-block;background:#0A69C9;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600}@media(max-width:640px){.hero{padding:56px 20px}.hero h1{font-size:36px}}`
    );
    setJsInput("");
    setImageAssets([]);
    setResult(null);
    setStatusText("Responsive sample loaded.");
  };

  // Read file as base64 promise helper
  const readFileAsDataUrl = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  // Load uploaded files
  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);

    let loadedHtml = "";
    let loadedCss = [];
    let loadedJs = [];
    let newImageAssets = [];

    for (const file of fileList) {
      const isImg = (file.type && file.type.startsWith("image/")) || /\.(png|jpe?g|webp|gif|svg|avif|ico|bmp)$/i.test(file.name);
      if (isImg) {
        try {
          const dataUrl = await readFileAsDataUrl(file);
          newImageAssets.push({
            filename: file.name,
            data: dataUrl,
            size: file.size,
            type: file.type || "image/png",
          });
        } catch (e) {
          console.error("Error reading image file:", file.name, e);
        }
      } else {
        const text = await file.text();
        if (/\.html?$/i.test(file.name)) {
          loadedHtml = text;
        } else if (/\.css$/i.test(file.name)) {
          loadedCss.push(text);
        } else if (/\.js$/i.test(file.name)) {
          loadedJs.push(text);
        }
      }
    }

    if (loadedHtml) setHtmlInput(loadedHtml);
    if (loadedCss.length > 0) setCssInput(loadedCss.join("\n\n"));
    if (loadedJs.length > 0) setJsInput(loadedJs.join("\n\n"));
    if (newImageAssets.length > 0) {
      setImageAssets((prev) => [...prev.filter(p => !newImageAssets.some(n => n.filename === p.filename)), ...newImageAssets]);
      setStatusText(`Loaded ${newImageAssets.length} image asset(s).`);
    } else {
      setStatusText("Files loaded successfully.");
    }

    setResult(null);
  };

  // Delete image asset
  const handleRemoveImageAsset = (filename) => {
    setImageAssets((prev) => prev.filter((img) => img.filename !== filename));
  };

  // Drag & drop handlers
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  // Convert handler
  const handleConvert = async () => {
    if (!htmlInput.trim()) {
      setStatusText("Please enter HTML input first.");
      return;
    }

    setIsConverting(true);
    setStatusText("Converting HTML & CSS to Gutenberg blocks...");

    try {
      const response = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: htmlInput,
          css: cssInput,
          js: jsInput,
          title: pageTitle,
          mediaPrefix: mediaPrefix,
          imageAssets: imageAssets,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Conversion failed.");

      setResult(data);
      setEngineBadgeText("Engine: Deterministic");
      setBlockCount(data.summary?.blockStats?.total || 0);
      setActiveOutputTab("converted");
      setStatusText("Conversion completed! Import JSON into WordPress Tools > Gutenberg Converter Import.");
    } catch (err) {
      setStatusText(`Error: ${err.message}`);
    } finally {
      setIsConverting(false);
    }
  };

  // Download helper
  const downloadFile = (filename, content, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatusText("Copied to clipboard!");
    } catch {
      setStatusText("Failed to copy. Please select text manually.");
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] w-full gap-4 p-4 bg-white text-gray-900 overflow-hidden font-sans">
      
      {/* WORKSPACE GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        
        {/* LEFT PANEL: INPUTS & ACTIONS */}
        <div className="flex flex-col bg-white border border-gray-200 shadow-sm rounded-2xl p-4 min-h-0">
          
          {/* OPTIONS BAR */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Export Title / Pattern Name
              </label>
              <input
                type="text"
                value={pageTitle}
                onChange={(e) => setPageTitle(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary-500 focus:bg-white"
                placeholder="e.g. Hero Section"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Media Base URL (Optional)
              </label>
              <input
                type="text"
                value={mediaPrefix}
                onChange={(e) => setMediaPrefix(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary-500 focus:bg-white"
                placeholder="https://example.com/wp-content/uploads"
              />
            </div>
          </div>

          {/* DROPZONE */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200 mb-3 ${
              isDragOver
                ? "border-primary-500 bg-primary-50"
                : "border-gray-300 bg-gray-50/80 hover:border-primary-500 hover:bg-gray-50"
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept=".html,.css,.js,.png,.jpg,.jpeg,.webp,.svg,.gif"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div className="flex flex-col items-center gap-1">
              <Icon icon="solar:upload-square-bold" width="32" height="32" className="text-primary-500" />
              <p className="text-sm font-medium text-gray-800">
                Drag & drop HTML, CSS, JS or Image files (PNG, JPG, WebP, SVG) or{" "}
                <span className="text-primary-600 underline">browse</span>
              </p>
              <span className="text-xs text-gray-500">
                Auto-attaches images to WordPress Media Library on 1-Click Push.
              </span>
            </div>
          </div>

          {/* IMAGE ASSETS SECTION */}
          <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
            <input
              type="file"
              ref={imageFileInputRef}
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
                <Icon icon="solar:gallery-bold" width="16" height="16" className="text-primary-500" />
                <span>Uploaded Images ({imageAssets.length})</span>
              </div>
              <button
                type="button"
                onClick={() => imageFileInputRef.current?.click()}
                className="px-2.5 py-1 text-xs font-semibold text-primary-600 bg-white border border-primary-300 rounded-lg hover:bg-primary-50 transition-colors shadow-sm flex items-center gap-1"
              >
                <Icon icon="solar:add-circle-bold" width="14" height="14" />
                <span>Add Images</span>
              </button>
            </div>

            {imageAssets && imageAssets.length > 0 ? (
              <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto pr-1">
                {imageAssets.map((asset, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-1.5 pr-2.5 shadow-sm text-xs"
                  >
                    <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-100 flex-shrink-0">
                      <img src={asset.data} alt={asset.filename} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-col truncate max-w-[130px]">
                      <span className="font-semibold text-gray-800 truncate" title={asset.filename}>
                        {asset.filename}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {(asset.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveImageAsset(asset.filename)}
                      className="text-gray-400 hover:text-rose-500 p-1 rounded transition-colors ml-1"
                      title="Remove image asset"
                    >
                      <Icon icon="solar:trash-bin-minimalistic-bold" width="14" height="14" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-gray-500 italic">
                No local images uploaded yet. Click <strong>+ Add Images</strong> to pick PNG/JPG files from your computer.
              </p>
            )}
          </div>

          {/* EDITOR SECTION */}
          <div className="flex-1 flex flex-col min-h-0 border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
            {/* TABS HEADER */}
            <div className="flex items-center justify-between bg-gray-100 px-3 py-2 border-b border-gray-200">
              <div className="flex gap-1">
                <button
                  onClick={() => setActiveInputTab("html")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeInputTab === "html"
                      ? "bg-primary-500 text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-200"
                  }`}
                >
                  HTML Input *
                </button>
                <button
                  onClick={() => setActiveInputTab("css")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeInputTab === "css"
                      ? "bg-primary-500 text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-200"
                  }`}
                >
                  CSS (@media)
                </button>
                <button
                  onClick={() => setActiveInputTab("js")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeInputTab === "js"
                      ? "bg-primary-500 text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-200"
                  }`}
                >
                  JS Input
                </button>
              </div>

              <button
                onClick={handleLoadSample}
                className="px-2.5 py-1 text-xs font-medium text-primary-600 bg-white border border-primary-300 rounded-lg hover:bg-primary-50 transition-colors shadow-sm"
              >
                Load Sample Code
              </button>
            </div>

            {/* TAB CONTENTS */}
            <div className="flex-1 min-h-0 relative">
              {activeInputTab === "html" && (
                <textarea
                  value={htmlInput}
                  onChange={(e) => {
                    setHtmlInput(e.target.value);
                    setResult(null);
                  }}
                  placeholder="Paste your HTML code here..."
                  className="w-full h-full p-3 bg-white text-gray-900 font-mono text-xs resize-none focus:outline-none"
                  spellCheck="false"
                />
              )}
              {activeInputTab === "css" && (
                <textarea
                  value={cssInput}
                  onChange={(e) => {
                    setCssInput(e.target.value);
                    setResult(null);
                  }}
                  placeholder="Paste your CSS code here (including @media queries)..."
                  className="w-full h-full p-3 bg-white text-gray-900 font-mono text-xs resize-none focus:outline-none"
                  spellCheck="false"
                />
              )}
              {activeInputTab === "js" && (
                <textarea
                  value={jsInput}
                  onChange={(e) => {
                    setJsInput(e.target.value);
                    setResult(null);
                  }}
                  placeholder="Paste optional JS script content..."
                  className="w-full h-full p-3 bg-white text-gray-900 font-mono text-xs resize-none focus:outline-none"
                  spellCheck="false"
                />
              )}
            </div>
          </div>

          {/* ACTION BUTTON */}
          <div className="mt-3">
            <button
              onClick={handleConvert}
              disabled={isConverting || !htmlInput.trim()}
              className="w-full bg-primary-500 hover:bg-primary-600 text-white font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icon icon="solar:bolt-bold" width="20" height="20" />
              <span>{isConverting ? "Converting HTML & CSS..." : "Convert to Gutenberg Pattern JSON & CSS"}</span>
            </button>
          </div>

        </div>

        {/* RIGHT PANEL: PREVIEWS & OUTPUTS */}
        <div className="flex flex-col bg-white border border-gray-200 shadow-sm rounded-2xl p-4 min-h-0">
          
          {/* OUTPUT HEADER & ACTION BUTTONS */}
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-2">
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setActiveOutputTab("preview")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeOutputTab === "preview"
                      ? "bg-primary-500 text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  Source Preview
                </button>
                <button
                  onClick={() => setActiveOutputTab("converted")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeOutputTab === "converted"
                      ? "bg-primary-500 text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  Converted Preview
                </button>
                <button
                  onClick={() => setActiveOutputTab("json")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeOutputTab === "json"
                      ? "bg-primary-500 text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  Import JSON
                </button>
                <button
                  onClick={() => setActiveOutputTab("css")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeOutputTab === "css"
                      ? "bg-primary-500 text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  Pattern CSS
                </button>
                <button
                  onClick={() => setActiveOutputTab("notes")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeOutputTab === "notes"
                      ? "bg-primary-500 text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  Installation & Notes
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  disabled={!result}
                  onClick={() => copyToClipboard(JSON.stringify(result, null, 2))}
                  className="px-2.5 py-1 text-xs font-medium bg-gray-100 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-40 transition-colors"
                >
                  Copy JSON
                </button>
                <button
                  disabled={!result}
                  onClick={() =>
                    downloadFile(
                      `${result?.slug || "converted-page"}.gcb.json`,
                      JSON.stringify(result, null, 2),
                      "application/json"
                    )
                  }
                  className="px-2.5 py-1 text-xs font-medium bg-secondary-500 hover:bg-secondary-600 text-white rounded-lg disabled:opacity-40 transition-colors shadow-sm"
                >
                  Download JSON
                </button>
                <button
                  disabled={!result}
                  onClick={() => setIsWpModalOpen(true)}
                  className="px-3 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg disabled:opacity-40 transition-colors shadow-sm flex items-center gap-1.5"
                >
                  <Icon icon="solar:rocket-bold" width="14" height="14" />
                  <span>Push to WordPress</span>
                </button>
              </div>
            </div>
          </div>

          {/* OUTPUT VIEW BODY */}
          <div className="flex-1 min-h-0 border border-gray-200 rounded-xl overflow-hidden bg-gray-900 relative">
            {activeOutputTab === "preview" && (
              <iframe
                ref={previewIframeRef}
                title="Source Preview"
                className="w-full h-full bg-white border-none"
              />
            )}

            {activeOutputTab === "converted" && (
              <iframe
                ref={convertedIframeRef}
                title="Converted Preview"
                className="w-full h-full bg-white border-none"
              />
            )}

            {activeOutputTab === "json" && (
              <pre className="w-full h-full p-4 overflow-auto font-mono text-xs text-sky-400 bg-gray-950">
                {result ? JSON.stringify(result, null, 2) : "// Gutenberg Pattern JSON output will appear here after conversion..."}
              </pre>
            )}

            {activeOutputTab === "css" && (
              <pre className="w-full h-full p-4 overflow-auto font-mono text-xs text-emerald-400 bg-gray-950">
                {result?.patternCss || "/* Pattern-scoped responsive CSS with media queries will appear here... */"}
              </pre>
            )}

            {activeOutputTab === "notes" && (
              <div className="w-full h-full p-4 overflow-auto text-xs text-gray-300 bg-gray-950 leading-relaxed">
                <h4 className="text-sm font-semibold text-white mb-2">WordPress Installation & Usage Instructions</h4>
                <ol className="list-decimal pl-4 space-y-2">
                  <li>Install and activate the <strong>Gutenberg Converter Runtime</strong> plugin in your WordPress admin dashboard once.</li>
                  <li>Navigate to <strong>Tools &gt; Gutenberg Converter Import</strong> in WordPress.</li>
                  <li>Upload the exported <code>.gcb.json</code> file to automatically create editable Gutenberg blocks along with pattern-scoped responsive styles.</li>
                  <li>Open any Page or Post in the WordPress Block Editor to insert your new pattern block.</li>
                </ol>
                {result?.meta?.warnings && result.meta.warnings.length > 0 && (
                  <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400">
                    <p className="font-semibold mb-1">Conversion Warnings:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      {result.meta.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* STATUS BAR */}
          <div className="mt-3 flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-primary-100 text-primary-700 font-semibold border border-primary-200">
                {engineBadgeText}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-secondary-100 text-secondary-700 font-semibold border border-secondary-200">
                Blocks: {blockCount}
              </span>
            </div>
            <span className="text-gray-600 truncate max-w-[280px]">
              {statusText}
            </span>
          </div>

        </div>

      </div>

      {/* WORDPRESS 1-CLICK PUSH MODAL */}
      <WpPushModal
        isOpen={isWpModalOpen}
        onClose={() => setIsWpModalOpen(false)}
        bundle={result}
      />

    </div>
  );
}
