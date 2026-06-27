"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppCredentials } from "@/lib/credentials";
import { loadStoredCredentials } from "@/lib/credentials";
import type { ModelOption } from "@/lib/models";
import { DEFAULT_MODEL_ID } from "@/lib/models";
import {
  createEmptyProject,
  exportProjectJson,
  getCurrentProjectId,
  importProjectJson,
  loadProject,
  saveProject,
  setCurrentProjectId,
  type StoredProject,
} from "@/lib/project-storage";
import { ProjectWorkspace } from "./project-workspace";
import { ProjectsMenu } from "./projects-menu";
import { SettingsModal } from "./settings-modal";

function getOrCreateProjectId(): string {
  if (typeof window === "undefined") return "";
  const existing = getCurrentProjectId();
  if (existing) return existing;
  const project = createEmptyProject();
  saveProject(project);
  return project.id;
}

export function Builder() {
  const [projectId, setProjectId] = useState("");
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [setupHint, setSetupHint] = useState<string | null>(null);
  const [sandboxReady, setSandboxReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [credentials, setCredentials] = useState<AppCredentials>({});

  const fetchModels = useCallback(async (creds: AppCredentials) => {
    const res = await fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credentials: creds }),
    });
    const data = await res.json();
    if (data.models?.length) {
      setAvailableModels(data.models);
      if (data.defaultModelId) setModelId(data.defaultModelId);
    } else {
      setAvailableModels([]);
    }
    setSetupHint(data.setupHint ?? null);
    setSandboxReady(Boolean(data.sandbox?.sandbox));
    return data as { sandbox?: { sandbox: boolean } };
  }, []);

  const initPreview = useCallback(
    async (id: string, creds: AppCredentials, sandboxAvailable: boolean) => {
      if (!sandboxAvailable) return;
      try {
        await fetch("/api/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: id, credentials: creds }),
        });
      } catch {
        // preview optional — local srcDoc still works
      }
    },
    [],
  );

  const applyCredentials = useCallback(
    async (creds: AppCredentials) => {
      setCredentials(creds);
      const data = await fetchModels(creds);
      const id = projectId || getOrCreateProjectId();
      await initPreview(id, creds, Boolean(data.sandbox?.sandbox));
    },
    [fetchModels, initPreview, projectId],
  );

  useEffect(() => {
    const creds = loadStoredCredentials();
    setCredentials(creds);
    setProjectId(getOrCreateProjectId());

    (async () => {
      const data = await fetchModels(creds);
      const id = getOrCreateProjectId();
      await initPreview(id, creds, Boolean(data.sandbox?.sandbox));
      if (!creds.googleApiKey && !creds.aiGatewayApiKey) {
        setSettingsOpen(true);
      }
    })();
  }, [fetchModels, initPreview]);

  const handleNewProject = () => {
    const project = createEmptyProject();
    saveProject(project);
    setProjectId(project.id);
  };

  const handleSelectProject = (id: string) => {
    setCurrentProjectId(id);
    setProjectId(id);
  };

  const handleImportProject = (project: StoredProject) => {
    saveProject(project);
    setProjectId(project.id);
  };

  const handleExportProject = () => {
    const project = loadProject(projectId);
    if (!project) return;
    const blob = new Blob([exportProjectJson(project)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.title.slice(0, 40).replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!projectId) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#09090b] text-zinc-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#09090b]">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold">
            S
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100">SCORM Forge</h1>
            <p className="text-xs text-zinc-500">AI SCORM authoring · edit · export</p>
          </div>
          <ProjectsMenu
            currentId={projectId}
            onSelect={handleSelectProject}
            onNew={handleNewProject}
            onImport={handleImportProject}
          />
        </div>
        <div className="flex items-center gap-2">
          {availableModels.length > 0 && (
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300 focus:border-indigo-500 focus:outline-none"
              title="AI model"
            >
              {availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={handleExportProject}
            className="hidden rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-500 sm:inline"
            title="Export project JSON (chat + files backup)"
          >
            Export
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
          >
            Settings
          </button>
        </div>
      </header>

      {setupHint && (
        <div className="shrink-0 border-b border-amber-900/50 bg-amber-950/40 px-4 py-2.5 text-xs text-amber-200">
          <strong>Setup:</strong> {setupHint}{" "}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="font-medium text-amber-100 underline hover:no-underline"
          >
            Settings
          </button>
        </div>
      )}

      <ProjectWorkspace
        key={projectId}
        projectId={projectId}
        modelId={modelId}
        credentials={credentials}
        availableModels={availableModels}
        sandboxReady={sandboxReady}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={applyCredentials}
      />
    </div>
  );
}
