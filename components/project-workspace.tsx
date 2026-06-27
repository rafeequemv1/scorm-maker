"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { AppCredentials } from "@/lib/credentials";
import type { ModelOption } from "@/lib/models";
import {
  buildPreviewBlobUrl,
  revokePreviewBlobUrls,
} from "@/lib/preview-html";
import {
  deriveProjectTitle,
  loadProject,
  saveProject,
} from "@/lib/project-storage";
import { downloadScormPackage } from "@/lib/scorm-packager";
import type { LogLine } from "@/lib/sandbox-logs";
import { appendLogs } from "@/lib/sandbox-logs";
import type { BuilderUIMessage } from "@/lib/types";
import { ChatPanel } from "./chat-panel";
import { WorkspacePanel } from "./workspace-panel";
import type { ProjectFileMap } from "./code-panel";

interface ProjectWorkspaceProps {
  projectId: string;
  modelId: string;
  credentials: AppCredentials;
  availableModels: ModelOption[];
  sandboxReady: boolean;
  onOpenSettings: () => void;
}

export function ProjectWorkspace({
  projectId,
  modelId,
  credentials,
  availableModels,
  sandboxReady,
  onOpenSettings,
}: ProjectWorkspaceProps) {
  const stored = useMemo(() => loadProject(projectId), [projectId]);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [files, setFiles] = useState<string[]>(() =>
    Object.keys(stored?.files ?? {}),
  );
  const [fileContents, setFileContents] = useState<ProjectFileMap>(
    stored?.files ?? {},
  );
  const [selectedFile, setSelectedFile] = useState<string | null>(() => {
    const keys = Object.keys(stored?.files ?? {});
    return keys[0] ?? null;
  });
  const [viewMode, setViewMode] = useState<"preview" | "code" | "logs">("preview");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [buildStatus, setBuildStatus] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingScorm, setDownloadingScorm] = useState(false);
  const [streamingFile, setStreamingFile] = useState<string | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewSource, setPreviewSource] = useState<"sandbox" | "local" | null>(
    null,
  );
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const previewKey = useRef(0);
  const blobUrlsRef = useRef<string[]>([]);

  const credentialsRef = useRef(credentials);
  const modelIdRef = useRef(modelId);
  const fileContentsRef = useRef(fileContents);
  credentialsRef.current = credentials;
  modelIdRef.current = modelId;
  fileContentsRef.current = fileContents;

  const refreshSandboxPreview = useCallback(
    async (filesOverride?: ProjectFileMap) => {
      if (!sandboxReady) return;
      const filesToSync = filesOverride ?? fileContentsRef.current;
      if (Object.keys(filesToSync).length === 0) return;

      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const res = await fetch("/api/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            credentials: credentialsRef.current,
            files: filesToSync,
          }),
        });
        const data = await res.json();
        if (data.logs?.length) {
          setLogs((prev) => appendLogs(prev, data.logs));
        }
        if (data.previewUrl) {
          setPreviewUrl(data.previewUrl);
          setPreviewSource("sandbox");
          setPreviewError(null);
          previewKey.current += 1;
        } else if (data.error && !data.skipped) {
          setPreviewError(data.error);
        }
      } catch (err) {
        setPreviewError(
          err instanceof Error ? err.message : "Sandbox preview failed",
        );
      } finally {
        setPreviewLoading(false);
      }
    },
    [projectId, sandboxReady],
  );

  const refreshSandboxLogs = useCallback(async () => {
    if (!sandboxReady) return;
    setLogsLoading(true);
    try {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          credentials: credentialsRef.current,
          lines: 120,
        }),
      });
      const data = await res.json();
      if (data.logs?.length) {
        setLogs((prev) => appendLogs(prev, data.logs));
      }
    } catch {
      // optional
    } finally {
      setLogsLoading(false);
    }
  }, [projectId, sandboxReady]);

  const refreshPreview = useCallback(() => {
    previewKey.current += 1;
    if (sandboxReady && Object.keys(fileContentsRef.current).length > 0) {
      void refreshSandboxPreview();
    }
  }, [refreshSandboxPreview, sandboxReady]);

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
    },
    [],
  );

  const { messages, sendMessage, status } = useChat<BuilderUIMessage>({
    id: projectId,
    messages: stored?.messages ?? [],
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
          projectId,
          modelId: modelIdRef.current,
          credentials: credentialsRef.current,
          projectFiles: fileContentsRef.current,
        },
      }),
    }),
    onError: (error) => {
      setBuildStatus(null);
      setStreamingFile(null);
      setChatError(
        error.message || "Chat failed. Check your API key in Settings.",
      );
    },
    onFinish: () => {
      setBuildStatus(null);
      setStreamingFile(null);
      setViewMode("preview");
      refreshPreview();
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
        if (dataPart.data.streaming) {
          setStreamingFile(dataPart.data.path);
          setViewMode("code");
        } else {
          setStreamingFile(null);
        }
      }
      if (dataPart.type === "data-preview") {
        setPreviewUrl(dataPart.data.url);
        setPreviewSource("sandbox");
        setPreviewLoading(false);
        setViewMode("preview");
        refreshPreview();
      }
      if (dataPart.type === "data-log") {
        setLogs((prev) => appendLogs(prev, [dataPart.data]));
      }
      if (dataPart.type === "data-files") {
        setFiles((prev) => [...new Set([...prev, ...dataPart.data.paths])]);
      }
    },
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      saveProject({
        id: projectId,
        title: deriveProjectTitle(messages, fileContents),
        updatedAt: Date.now(),
        messages,
        files: fileContents,
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [projectId, messages, fileContents]);

  useEffect(() => {
    revokePreviewBlobUrls(blobUrlsRef.current);
    const built = buildPreviewBlobUrl(fileContents, blobUrlsRef.current);
    if (built) {
      blobUrlsRef.current = built.allUrls;
      setPreviewBlobUrl(built.url);
      if (!previewUrl) {
        setPreviewSource("local");
      }
      previewKey.current += 1;
    } else {
      blobUrlsRef.current = [];
      setPreviewBlobUrl(null);
      if (!previewUrl) {
        setPreviewSource(null);
      }
    }
    return () => revokePreviewBlobUrls(blobUrlsRef.current);
  }, [fileContents, previewUrl]);

  useEffect(() => {
    if (!sandboxReady) return;
    const hasFiles = Object.keys(fileContents).length > 0;
    if (hasFiles) {
      void refreshSandboxPreview(fileContents);
    } else {
      setPreviewLoading(true);
      fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          credentials: credentialsRef.current,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.logs?.length) {
            setLogs((prev) => appendLogs(prev, data.logs));
          }
          if (data.previewUrl) {
            setPreviewUrl(data.previewUrl);
            setPreviewSource("sandbox");
          } else if (data.error) {
            setPreviewError(data.error);
          }
        })
        .catch(() => {})
        .finally(() => setPreviewLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync on project/sandbox change only
  }, [projectId, sandboxReady]);

  const isGenerating = status === "streaming" || status === "submitted";
  const hasExistingLesson = Object.keys(fileContents).length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isGenerating) return;

    const hasClientKey =
      Boolean(credentials.googleApiKey) ||
      Boolean(credentials.aiGatewayApiKey);
    const hasServerKey = availableModels.length > 0;

    if (!hasClientKey && !hasServerKey) {
      setChatError("Add your Gemini API key in Settings first.");
      onOpenSettings();
      return;
    }

    setChatError(null);
    setBuildStatus(hasExistingLesson ? "Applying edits..." : "Starting...");
    setStreamingFile(null);
    sendMessage({ text });
    setInput("");
  };

  const handleDownloadScorm = async () => {
    setDownloadError(null);
    setDownloadingScorm(true);
    try {
      const title = deriveProjectTitle(messages, fileContents);
      await downloadScormPackage(fileContents, title);
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : "Failed to create SCORM package",
      );
    } finally {
      setDownloadingScorm(false);
    }
  };

  return (
    <>
      {downloadError && (
        <div className="shrink-0 border-b border-red-900/50 bg-red-950/40 px-4 py-2 text-xs text-red-300">
          SCORM download failed: {downloadError}
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
          hasExistingLesson={hasExistingLesson}
        />
        <WorkspacePanel
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          previewUrl={previewUrl}
          previewBlobUrl={previewBlobUrl}
          previewSource={previewSource}
          loading={previewLoading}
          error={previewError}
          refreshKey={previewKey.current}
          onRefresh={refreshPreview}
          onOpenSettings={onOpenSettings}
          onDownloadScorm={handleDownloadScorm}
          downloadingScorm={downloadingScorm}
          files={files}
          fileContents={fileContents}
          selectedFile={selectedFile}
          onSelectFile={setSelectedFile}
          filesLoading={filesLoading}
          buildStatus={buildStatus}
          isGenerating={isGenerating}
          streamingFile={streamingFile}
          logs={logs}
          logsLoading={logsLoading}
          onRefreshLogs={refreshSandboxLogs}
        />
      </div>
    </>
  );
}
