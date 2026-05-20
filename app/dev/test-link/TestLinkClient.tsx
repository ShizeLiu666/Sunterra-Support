"use client";

import { useState } from "react";
import type { InstallationData } from "@/types/installation";

const PRESET_VALID: InstallationData = {
  sn: "GW2024XK8B72",
  name: "John Smith",
  email: "john.smith@example.com",
  address: "123 Solar Ave, Adelaide SA 5000, Australia",
  inverterModel: "MIN3000TL-XH",
  language: "en-AU",
};

const PRESET_MINIMAL: InstallationData = {
  sn: "GW2024XK8B72",
};

type Scenario = "valid" | "expired" | "tampered" | "missing_sn" | "custom";

export default function TestLinkClient() {
  const [data, setData] = useState<InstallationData>(PRESET_VALID);
  const [scenario, setScenario] = useState<Scenario>("valid");
  const [generatedUrl, setGeneratedUrl] = useState<string>("");
  const [error, setError] = useState<string>("");

  async function handleGenerate() {
    setError("");
    setGeneratedUrl("");

    try {
      const response = await fetch("/api/dev/build-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, scenario }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Failed to generate URL");
      }

      const result = await response.json();
      setGeneratedUrl(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  function loadPreset(p: "valid" | "minimal") {
    setData(p === "valid" ? PRESET_VALID : PRESET_MINIMAL);
  }

  function updateField(field: keyof InstallationData, value: string) {
    setData((prev) => ({ ...prev, [field]: value || undefined }));
  }

  return (
    <div className="min-h-screen bg-white p-6 md:p-10 max-w-3xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-sunterra-dark">
          Test Link Generator
        </h1>
        <p className="text-sm text-gray-600 mt-2">
          Dev-only tool. Generates signed URLs that mimic ShinePhone redirects.
        </p>
        <div className="mt-3 inline-block px-3 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium">
          ⚠️ Not available in production
        </div>
      </header>

      <section className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="text-sm font-medium mb-2">Quick presets:</div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => loadPreset("valid")}
            className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm hover:bg-gray-100"
          >
            Full data
          </button>
          <button
            onClick={() => loadPreset("minimal")}
            className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm hover:bg-gray-100"
          >
            Minimal (SN only)
          </button>
        </div>
      </section>

      <section className="mb-6 space-y-4">
        <h2 className="text-lg font-medium">Installation data</h2>

        {(["sn", "name", "email", "address", "inverterModel", "language"] as const).map(
          (field) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {field}
                {field === "sn" && <span className="text-red-500"> *</span>}
              </label>
              <input
                type="text"
                value={data[field] ?? ""}
                onChange={(e) => updateField(field, e.target.value)}
                placeholder={field === "sn" ? "Required" : "Optional"}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-sunterra-primary"
              />
            </div>
          )
        )}
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-medium mb-2">Scenario</h2>
        <div className="space-y-2">
          {[
            { v: "valid", label: "✅ Valid (signed correctly, current timestamp)" },
            { v: "expired", label: "⏰ Expired (timestamp 25h ago)" },
            { v: "tampered", label: "🔴 Tampered (signature corrupted)" },
            { v: "missing_sn", label: "❌ Missing SN (required field absent)" },
          ].map(({ v, label }) => (
            <label key={v} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="scenario"
                value={v}
                checked={scenario === v}
                onChange={() => setScenario(v as Scenario)}
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </section>

      <button
        onClick={handleGenerate}
        className="w-full md:w-auto px-6 py-3 bg-sunterra-primary text-white rounded-md font-medium hover:opacity-90 transition"
      >
        Generate test URL
      </button>

      {error && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      {generatedUrl && (
        <div className="mt-6 space-y-3">
          <h2 className="text-lg font-medium">Generated URL</h2>
          <textarea
            readOnly
            value={generatedUrl}
            rows={6}
            className="w-full p-3 font-mono text-xs border border-gray-300 rounded-md bg-gray-50"
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
          />
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => navigator.clipboard.writeText(generatedUrl)}
              className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm hover:bg-gray-100"
            >
              📋 Copy
            </button>
            <a
              href={generatedUrl}
              className="px-3 py-1.5 bg-sunterra-primary text-white rounded-md text-sm hover:opacity-90"
            >
              🔗 Open in this window
            </a>
            <a
              href={generatedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm hover:bg-gray-100"
            >
              🆕 Open in new tab
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
