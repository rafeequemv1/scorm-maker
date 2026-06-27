"use client";

export type ProjectFileMap = Record<string, string>;

interface CodePanelProps {
  files: string[];
  contents: ProjectFileMap;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  loading?: boolean;
}

function fileIcon(path: string) {
  if (path.endsWith(".html")) return "◆";
  if (path.endsWith(".css")) return "◇";
  if (path.endsWith(".js")) return "▸";
  return "·";
}

export function CodePanel({
  files,
  contents,
  selectedFile,
  onSelectFile,
  loading,
}: CodePanelProps) {
  const sorted = [...files].sort();
  const active = selectedFile ?? sorted[0] ?? null;
  const content = active ? contents[active] : null;

  return (
    <div className="flex h-full overflow-hidden bg-[#0d1117]">
      <aside className="flex min-h-0 w-44 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
        <div className="border-b border-zinc-800 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Files {sorted.length > 0 && `(${sorted.length})`}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading && sorted.length === 0 && (
            <p className="px-2 py-1 text-xs text-zinc-600">Loading...</p>
          )}
          {!loading && sorted.length === 0 && (
            <p className="px-2 py-1 text-xs text-zinc-600">
              No files yet. Describe a lesson in chat to generate SCORM content.
            </p>
          )}
          {sorted.map((path) => (
            <button
              key={path}
              type="button"
              onClick={() => onSelectFile(path)}
              className={`mb-0.5 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition ${
                active === path
                  ? "bg-indigo-600/20 text-indigo-300"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              <span className="text-[10px] opacity-60">{fileIcon(path)}</span>
              <span className="truncate">{path}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {active ? (
          <>
            <div className="flex shrink-0 items-center border-b border-zinc-800 bg-zinc-950 px-4 py-2">
              <span className="font-mono text-xs text-zinc-400">{active}</span>
              <span className="ml-auto text-[11px] text-zinc-600">
                {content ? `${content.split("\n").length} lines` : ""}
              </span>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto overscroll-contain p-4 font-mono text-xs leading-relaxed text-zinc-300">
              <code>{content ?? "// File content loading..."}</code>
            </pre>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-zinc-600">
            Lesson code will appear here
          </div>
        )}
      </div>
    </div>
  );
}
