"use client";

import { useEffect, useRef } from "react";
import type { LogLine } from "@/lib/sandbox-logs";
import { formatLogLine } from "@/lib/sandbox-logs";

interface LogsPanelProps {
  logs: LogLine[];
  loading?: boolean;
  onRefresh?: () => void;
}

export function LogsPanel({ logs, loading, onRefresh }: LogsPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [logs.length]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="text-xs font-medium text-zinc-400">
          Sandbox console
        </span>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded px-2 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
          >
            {loading ? "Fetching…" : "Refresh"}
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed">
        {logs.length === 0 ? (
          <p className="text-zinc-600">
            Logs appear here during builds and sandbox preview startup.
          </p>
        ) : (
          logs.map((line, i) => (
            <div
              key={`${line.timestamp}-${i}`}
              className={
                line.stream === "stderr"
                  ? "text-red-400"
                  : line.stream === "system"
                    ? "text-indigo-400/90"
                    : "text-zinc-400"
              }
            >
              {formatLogLine(line)}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
