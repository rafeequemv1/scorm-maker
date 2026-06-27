"use client";

import { CodePanel, type ProjectFileMap } from "./code-panel";

type ViewMode = "preview" | "code";

interface WorkspacePanelProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  previewUrl: string | null;
  loading: boolean;
  error: string | null;
  refreshKey: number;
  onRefresh: () => void;
  onOpenSettings?: () => void;
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
  loading,
  error,
  refreshKey,
  onRefresh,
  onOpenSettings,
  files,
  fileContents,
  selectedFile,
  onSelectFile,
  filesLoading,
  buildStatus,
  isGenerating,
}: WorkspacePanelProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-zinc-950">
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
          {viewMode === "preview" && previewUrl && (
            <>
              <button
                type="button"
                onClick={onRefresh}
                className="rounded-md px-2 py-1 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
              >
                Refresh
              </button>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md px-2 py-1 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
              >
                Open ↗
              </a>
            </>
          )}
        </div>
      </div>

      <div className="relative flex-1 p-3">
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
          <div className="h-full overflow-hidden rounded-xl border border-zinc-800 bg-white shadow-2xl shadow-black/40">
            {loading && !previewUrl && (
              <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-900 text-zinc-400">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-500" />
                <p className="text-sm">Starting Vercel Sandbox...</p>
                <p className="text-xs text-zinc-600">This may take a few seconds</p>
              </div>
            )}

            {error && !previewUrl && (
              <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-900 p-6 text-center">
                <p className="text-sm text-amber-400">Preview unavailable</p>
                <p className="max-w-sm text-xs text-zinc-500">{error}</p>
                <p className="max-w-sm text-xs text-zinc-600">
                  Switch to the <strong className="text-zinc-400">Code</strong> tab to
                  see generated files while building.
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

            {previewUrl && (
              <iframe
                key={refreshKey}
                src={previewUrl}
                title="Website preview"
                className="h-full w-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
