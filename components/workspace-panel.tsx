"use client";

import { CodePanel, type ProjectFileMap } from "./code-panel";

type ViewMode = "preview" | "code";

interface WorkspacePanelProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  previewUrl: string | null;
  previewDocument?: string | null;
  loading: boolean;
  error: string | null;
  refreshKey: number;
  onRefresh: () => void;
  onOpenSettings?: () => void;
  onDownloadScorm?: () => void;
  downloadingScorm?: boolean;
  files: string[];
  fileContents: ProjectFileMap;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  filesLoading?: boolean;
  buildStatus?: string | null;
  isGenerating?: boolean;
}

export function WorkspacePanel({
  viewMode,
  onViewModeChange,
  previewUrl,
  previewDocument,
  loading,
  error,
  refreshKey,
  onRefresh,
  onOpenSettings,
  onDownloadScorm,
  downloadingScorm,
  files,
  fileContents,
  selectedFile,
  onSelectFile,
  filesLoading,
  buildStatus,
  isGenerating,
}: WorkspacePanelProps) {
  const hasPreview = Boolean(previewDocument || previewUrl);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-950">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
            <button
              type="button"
              onClick={() => onViewModeChange("preview")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                viewMode === "preview"
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Preview
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("code")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                viewMode === "code"
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Code {files.length > 0 && `(${files.length})`}
            </button>
          </div>
          {(buildStatus || isGenerating) && (
            <span className="hidden items-center gap-1.5 text-xs text-indigo-400 sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
              {buildStatus ?? "Building..."}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {files.length > 0 && onDownloadScorm && (
            <button
              type="button"
              onClick={onDownloadScorm}
              disabled={downloadingScorm}
              className="rounded-md border border-emerald-800/50 px-2 py-1 text-xs text-emerald-400 transition hover:bg-emerald-950/50 disabled:opacity-50"
            >
              {downloadingScorm ? "Packaging…" : "SCORM ↓"}
            </button>
          )}
          {viewMode === "preview" && hasPreview && (
            <>
              <button
                type="button"
                onClick={onRefresh}
                className="rounded-md px-2 py-1 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
              >
                Refresh
              </button>
              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md px-2 py-1 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
                >
                  Sandbox ↗
                </a>
              )}
            </>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden p-3">
        {viewMode === "code" ? (
          <div className="h-full overflow-hidden rounded-xl border border-zinc-800">
            <CodePanel
              files={files}
              contents={fileContents}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
              loading={filesLoading}
            />
          </div>
        ) : (
          <div className="flex h-full flex-col overflow-hidden rounded-xl border border-zinc-800 bg-white shadow-2xl shadow-black/40">
            {loading && !hasPreview && (
              <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-900 text-zinc-400">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-500" />
                <p className="text-sm">Starting Vercel Sandbox...</p>
                <p className="text-xs text-zinc-600">This may take a few seconds</p>
              </div>
            )}

            {error && !hasPreview && (
              <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-900 p-6 text-center">
                <p className="text-sm text-amber-400">Sandbox preview unavailable</p>
                <p className="max-w-sm text-xs text-zinc-500">{error}</p>
                <p className="max-w-sm text-xs text-zinc-600">
                  Generated sites still preview here once code is built. Switch to{" "}
                  <strong className="text-zinc-400">Code</strong> to inspect files.
                </p>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500"
                  >
                    Open Settings
                  </button>
                )}
              </div>
            )}

            {previewDocument && (
              <iframe
                key={`local-${refreshKey}-${previewDocument.length}`}
                srcDoc={previewDocument}
                title="Website preview"
                className="h-full w-full flex-1 border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            )}

            {!previewDocument && previewUrl && (
              <iframe
                key={`sandbox-${refreshKey}`}
                src={previewUrl}
                title="Sandbox preview"
                className="h-full w-full flex-1 border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            )}

            {!previewDocument && !previewUrl && !loading && !error && (
              <div className="flex h-full flex-col items-center justify-center gap-2 bg-zinc-900 p-6 text-center text-zinc-500">
                <p className="text-sm">No preview yet</p>
                <p className="text-xs">Describe a lesson in chat to generate interactive SCORM content.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
