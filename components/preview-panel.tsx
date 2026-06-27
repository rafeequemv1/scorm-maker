"use client";

interface PreviewPanelProps {
  previewUrl: string | null;
  loading: boolean;
  error: string | null;
  refreshKey: number;
  onRefresh: () => void;
  onOpenSettings?: () => void;
}

export function PreviewPanel({
  previewUrl,
  loading,
  error,
  refreshKey,
  onRefresh,
  onOpenSettings,
}: PreviewPanelProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-zinc-950">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-400">Preview</span>
          {previewUrl && (
            <span className="hidden truncate text-xs text-zinc-600 sm:inline max-w-xs">
              {previewUrl}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {previewUrl && (
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
              <p className="text-sm text-red-400">Failed to start sandbox</p>
              <p className="max-w-sm text-xs text-zinc-500">{error}</p>
              <p className="max-w-sm text-xs text-zinc-600">
                {error.includes("Settings") || error.includes("local")
                  ? error
                  : "Open Settings to add your Gemini key and Vercel Sandbox credentials for local preview."}
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
      </div>
    </div>
  );
}
