"use client";

import { useEffect, useRef } from "react";

export type ProjectFileMap = Record<string, string>;

interface CodePanelProps {
  files: string[];
  contents: ProjectFileMap;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  loading?: boolean;
  streamingFile?: string | null;
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
  streamingFile,
}: CodePanelProps) {
  const codeScrollRef = useRef<HTMLPreElement>(null);
  const sorted = [...files].sort();
  const active = selectedFile ?? sorted[0] ?? null;
  const content = active ? contents[active] : null;
  const isStreamingActive = Boolean(streamingFile && streamingFile === active);

  useEffect(() => {
    if (!isStreamingActive || !codeScrollRef.current) return;
    const el = codeScrollRef.current;
    el.scrollTop = el.scrollHeight;
  }, [content, isStreamingActive]);

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
              {streamingFile === path && (
                <span className="ml-auto h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-indigo-400" />
              )}
            </button>
          ))}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {active ? (
          <>
            <div className="flex shrink-0 items-center border-b border-zinc-800 bg-zinc-950 px-4 py-2">
              <span className="font-mono text-xs text-zinc-400">{active}</span>
              {isStreamingActive && (
                <span className="ml-2 flex items-center gap-1 text-[10px] text-indigo-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
                  writing
                </span>
              )}
              <span className="ml-auto text-[11px] text-zinc-600">
                {content ? `${content.split("\n").length} lines` : ""}
              </span>
            </div>
            <pre
              ref={codeScrollRef}
              className="min-h-0 flex-1 overflow-auto overscroll-contain p-4 font-mono text-xs leading-relaxed text-zinc-300"
            >
              <code>
                {content ?? ""}
                {isStreamingActive && (
                  <span
                    aria-hidden
                    className="ml-px inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-indigo-400"
                  />
                )}
              </code>
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
