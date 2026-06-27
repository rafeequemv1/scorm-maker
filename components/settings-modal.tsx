"use client";

import { useEffect, useState } from "react";
import type { AppCredentials } from "@/lib/credentials";
import {
  loadStoredCredentials,
  maskSecret,
  saveStoredCredentials,
} from "@/lib/credentials";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (credentials: AppCredentials) => void;
}

const EMPTY: AppCredentials = {
  googleApiKey: "",
  aiGatewayApiKey: "",
  vercelToken: "",
  vercelTeamId: "",
  vercelProjectId: "",
};

export function SettingsModal({ open, onClose, onSave }: SettingsModalProps) {
  const [form, setForm] = useState<AppCredentials>(EMPTY);
  const [showVercel, setShowVercel] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, ...loadStoredCredentials() });
    }
  }, [open]);

  if (!open) return null;

  const update = (key: keyof AppCredentials, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    const cleaned: AppCredentials = {};
    for (const [key, value] of Object.entries(form)) {
      if (value?.trim()) {
        cleaned[key as keyof AppCredentials] = value.trim();
      }
    }
    saveStoredCredentials(cleaned);
    onSave(cleaned);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        role="dialog"
        aria-labelledby="settings-title"
      >
        <div className="border-b border-zinc-800 px-5 py-4">
          <h2 id="settings-title" className="text-base font-semibold text-zinc-100">
            Settings
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Keys are saved in your browser only (localStorage). Never share this
            app publicly with keys stored.
          </p>
        </div>

        <div className="space-y-5 px-5 py-4">
          <section>
            <h3 className="text-sm font-medium text-zinc-200">Gemini API key</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Required for AI chat. Free at{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:underline"
              >
                Google AI Studio
              </a>
            </p>
            <input
              type="password"
              value={form.googleApiKey ?? ""}
              onChange={(e) => update("googleApiKey", e.target.value)}
              placeholder={
                loadStoredCredentials().googleApiKey
                  ? maskSecret(loadStoredCredentials().googleApiKey)
                  : "AIzaSy..."
              }
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
            />
          </section>

          <section>
            <h3 className="text-sm font-medium text-zinc-200">
              AI Gateway key <span className="text-zinc-500">(optional)</span>
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              Only needed for Claude or Gateway-routed models.
            </p>
            <input
              type="password"
              value={form.aiGatewayApiKey ?? ""}
              onChange={(e) => update("aiGatewayApiKey", e.target.value)}
              placeholder="Only if using Claude models"
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
            />
          </section>

          <section>
            <button
              type="button"
              onClick={() => setShowVercel(!showVercel)}
              className="flex w-full items-center justify-between text-sm font-medium text-zinc-200"
            >
              Vercel Sandbox credentials
              <span className="text-zinc-500">{showVercel ? "▲" : "▼"}</span>
            </button>
            <p className="mt-1 text-xs text-zinc-500">
              <strong className="text-zinc-400">Local dev only.</strong> When
              deployed on Vercel, sandbox auth is automatic (OIDC) — you do not
              need these.
            </p>
            {showVercel && (
              <div className="mt-3 space-y-3">
                <Field
                  label="Vercel Token"
                  hint="vercel.com/account/tokens"
                  value={form.vercelToken ?? ""}
                  onChange={(v) => update("vercelToken", v)}
                />
                <Field
                  label="Team ID"
                  hint="From vercel.com → Team Settings → General"
                  value={form.vercelTeamId ?? ""}
                  onChange={(v) => update("vercelTeamId", v)}
                />
                <Field
                  label="Project ID"
                  hint="From project Settings → General, or run vercel link"
                  value={form.vercelProjectId ?? ""}
                  onChange={(v) => update("vercelProjectId", v)}
                />
              </div>
            )}
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
            <h3 className="text-sm font-medium text-zinc-200">
              Deploying to Vercel
            </h3>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs text-zinc-400">
              <li>Push repo to GitHub and import in Vercel</li>
              <li>
                Enable <strong className="text-zinc-300">Sandbox</strong> on your
                team (Pro plan feature)
              </li>
              <li>
                Add <code className="text-zinc-300">GOOGLE_GENERATIVE_AI_API_KEY</code>{" "}
                in Vercel → Project → Settings → Environment Variables
              </li>
              <li>Deploy — sandbox uses OIDC automatically, no Vercel token needed</li>
              <li>
                Users can also paste Gemini key in Settings (browser-only, good for
                local use)
              </li>
            </ol>
          </section>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Save & apply
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-zinc-300">{label}</label>
      <p className="text-[11px] text-zinc-600">{hint}</p>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none"
      />
    </div>
  );
}
