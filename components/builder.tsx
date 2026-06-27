"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { AppCredentials } from "@/lib/credentials";
import { loadStoredCredentials } from "@/lib/credentials";
import type { ModelOption } from "@/lib/models";
import { DEFAULT_MODEL_ID } from "@/lib/models";
import type { BuilderUIMessage } from "@/lib/types";
import { buildPreviewDocument } from "@/lib/preview-html";
import { downloadScormPackage } from "@/lib/scorm-packager";
import { ChatPanel } from "./chat-panel";
import { SettingsModal } from "./settings-modal";
import { WorkspacePanel } from "./workspace-panel";
import type { ProjectFileMap } from "./code-panel";

const PROJECT_ID_KEY = "siteforge-project-id";

function getOrCreateProjectId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(PROJECT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PROJECT_ID_KEY, id);
  }
  return id;
}

export function Builder() {
  const [projectId, setProjectId] = useState(getOrCreateProjectId);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [fileContents, setFileContents] = useState<ProjectFileMap>({});
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const [previewLoading, setPreviewLoading] = useState(true);
  const [filesLoading, setFilesLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [buildStatus, setBuildStatus] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [setupHint, setSetupHint] = useState<string | null>(null);
  const [sandboxReady, setSandboxReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [credentials, setCredentials] = useState<AppCredentials>({});
  const [chatError, setChatError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingScorm, setDownloadingScorm] = useState(false);
  const previewKey = useRef(0);

  const credentialsRef = useRef<AppCredentials>({});
  const projectIdRef = useRef(projectId);
  const modelIdRef = useRef(modelId);

  credentialsRef.current = credentials;
  projectIdRef.current = projectId || getOrCreateProjectId();
  modelIdRef.current = modelId;

  const refreshPreview = useCallback(() => {
    previewKey.current += 1;
  }, []);

  const mergeFileContents = useCallback(
    (entries: Array<{ path: string; content: string }>) => {
      setFileContents((prev) => {
        const next = { ...prev };
        for (const entry of entries) {
          next[entry.path] = entry.content;
        }
        return next;
      });
      setFiles((prev) => [...new Set([...prev, ...entries.map((e) => e.path)])]);
      if (!selectedFile && entries[0]) {
        setSelectedFile(entries[0].path);
      }
    },
    [selectedFile],
  );

  const fetchAllFiles = useCallback(
    async (id: string, creds: AppCredentials) => {
      if (!sandboxReady) return;
      setFilesLoading(true);
      try {
        const res = await fetch("/api/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: id, credentials: creds }),
        });
        const data = await res.json();
        if (res.ok && data.files) {
          setFiles(data.files);
          setFileContents(data.contents ?? {});
          if (!selectedFile && data.files[0]) {
            setSelectedFile(data.files[0]);
          }
        }
      } catch {
        // ignore fetch errors
      } finally {
        setFilesLoading(false);
      }
    },
    [sandboxReady, selectedFile],
  );

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
    return data as { sandbox?: { sandbox: boolean; onVercel?: boolean } };
  }, []);

  const initPreview = useCallback(
    async (
      id: string,
      creds: AppCredentials,
      sandboxAvailable: boolean,
    ) => {
      setPreviewLoading(true);
      setPreviewError(null);

      if (!sandboxAvailable) {
        setPreviewLoading(false);
        setPreviewError(
          "Preview needs Vercel Sandbox. Chat and Code view still work — add Vercel credentials in Settings for live preview.",
        );
        return;
      }

      try {
        const res = await fetch("/api/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: id, credentials: creds }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load preview");
        setPreviewUrl(data.previewUrl);
        setFiles(data.files ?? []);
        if (data.files?.[0]) setSelectedFile(data.files[0]);
        await fetchAllFiles(id, creds);
      } catch (err) {
        setPreviewError(err instanceof Error ? err.message : "Preview failed");
      } finally {
        setPreviewLoading(false);
      }
    },
    [fetchAllFiles],
  );

  const applyCredentials = useCallback(
    async (creds: AppCredentials) => {
      setCredentials(creds);
      const data = await fetchModels(creds);
      const id = projectIdRef.current;
      await initPreview(id, creds, Boolean(data.sandbox?.sandbox));
    },
    [fetchModels, initPreview],
  );

  useEffect(() => {
    const creds = loadStoredCredentials();
    setCredentials(creds);

    (async () => {
      const data = await fetchModels(creds);
      const id = getOrCreateProjectId();
      setProjectId(id);
      await initPreview(id, creds, Boolean(data.sandbox?.sandbox));

      if (!creds.googleApiKey && !creds.aiGatewayApiKey) {
        setSettingsOpen(true);
      }
    })();
  }, [fetchModels, initPreview]);

  const { messages, sendMessage, status } = useChat<BuilderUIMessage>({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({
        messages,
        body,
        id,
        trigger,
        messageId,
      }) => ({
        body: {
          ...body,
          id,
          messages,
          trigger,
          messageId,
          projectId: projectIdRef.current || getOrCreateProjectId(),
          modelId: modelIdRef.current,
          credentials: credentialsRef.current,
        },
      }),
    }),
    onError: (error) => {
      setBuildStatus(null);
      setChatError(
        error.message || "Chat failed. Check your API key in Settings.",
      );
    },
    onFinish: () => {
      setBuildStatus(null);
      setViewMode("preview");
      fetchAllFiles(projectIdRef.current, credentialsRef.current);
    },
    onData: (dataPart) => {
      if (dataPart.type === "data-status") {
        setBuildStatus(dataPart.data.message);
      }
      if (dataPart.type === "data-fileContent") {
        mergeFileContents([
          { path: dataPart.data.path, content: dataPart.data.content },
        ]);
        setSelectedFile(dataPart.data.path);
      }
      if (dataPart.type === "data-preview") {
        setPreviewUrl(dataPart.data.url);
        setPreviewLoading(false);
        setViewMode("preview");
        refreshPreview();
      }
      if (dataPart.type === "data-files") {
        setFiles((prev) => [...new Set([...prev, ...dataPart.data.paths])]);
      }
    },
  });

  const isGenerating = status === "streaming" || status === "submitted";

  const previewDocument = useMemo(
    () => buildPreviewDocument(fileContents),
    [fileContents],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isGenerating) return;

    const id = projectIdRef.current || getOrCreateProjectId();
    if (!projectId) setProjectId(id);

    const hasClientKey =
      Boolean(credentials.googleApiKey) ||
      Boolean(credentials.aiGatewayApiKey);
    const hasServerKey = availableModels.length > 0;

    if (!hasClientKey && !hasServerKey) {
      setChatError("Add your Gemini API key in Settings first.");
      setSettingsOpen(true);
      return;
    }

    setChatError(null);
    setBuildStatus("Starting...");
    sendMessage({ text });
    setInput("");
  };

  const handleDownloadScorm = async () => {
    setDownloadError(null);
    setDownloadingScorm(true);
    try {
      const title =
        messages.find((m) => m.role === "user")?.parts.find((p) => p.type === "text")
          ?.text?.slice(0, 60) ?? "SCORM Lesson";
      await downloadScormPackage(fileContents, title);
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : "Failed to create SCORM package",
      );
    } finally {
      setDownloadingScorm(false);
    }
  };

  const handleNewProject = () => {
    const id = crypto.randomUUID();
    localStorage.setItem(PROJECT_ID_KEY, id);
    setProjectId(id);
    projectIdRef.current = id;
    setPreviewUrl(null);
    setFiles([]);
    setFileContents({});
    setSelectedFile(null);
    setPreviewLoading(true);
    initPreview(id, credentials, sandboxReady);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#09090b]">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold">
            S
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100">SCORM Forge</h1>
            <p className="text-xs text-zinc-500">AI SCORM authoring · Three.js · R3F · export to LMS</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {availableModels.length > 0 && (
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              disabled={isGenerating}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
              title="AI model"
            >
              {availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          )}
          {files.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleDownloadScorm}
                disabled={downloadingScorm || isGenerating}
                className="rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:border-emerald-600 hover:bg-emerald-900/40 disabled:opacity-50"
                title="Download as SCORM 1.2 ZIP for LMS upload"
              >
                {downloadingScorm ? "Packaging…" : "Download SCORM"}
              </button>
              <button
                type="button"
                onClick={() => setViewMode("code")}
                className="hidden text-xs text-zinc-500 hover:text-zinc-300 sm:inline"
              >
                {files.length} file{files.length !== 1 ? "s" : ""}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
          >
            Settings
          </button>
          <button
            type="button"
            onClick={handleNewProject}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
          >
            New project
          </button>
        </div>
      </header>

      {downloadError && (
        <div className="shrink-0 border-b border-red-900/50 bg-red-950/40 px-4 py-2 text-xs text-red-300">
          SCORM download failed: {downloadError}
        </div>
      )}

      {setupHint && (
        <div className="shrink-0 border-b border-amber-900/50 bg-amber-950/40 px-4 py-2.5 text-xs text-amber-200">
          <strong>Setup required:</strong> {setupHint}{" "}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="font-medium text-amber-100 underline hover:no-underline"
          >
            Open Settings
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ChatPanel
          messages={messages}
          input={input}
          setInput={setInput}
          onSubmit={handleSubmit}
          isGenerating={isGenerating}
          error={chatError}
          buildStatus={buildStatus}
        />
        <WorkspacePanel
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          previewUrl={previewUrl}
          previewDocument={previewDocument}
          loading={previewLoading}
          error={previewError}
          refreshKey={previewKey.current}
          onRefresh={refreshPreview}
          onOpenSettings={() => setSettingsOpen(true)}
          onDownloadScorm={handleDownloadScorm}
          downloadingScorm={downloadingScorm}
          files={files}
          fileContents={fileContents}
          selectedFile={selectedFile}
          onSelectFile={setSelectedFile}
          filesLoading={filesLoading}
          buildStatus={buildStatus}
          isGenerating={isGenerating}
        />
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={applyCredentials}
      />
    </div>
  );
}
