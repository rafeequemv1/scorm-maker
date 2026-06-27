"use client";

import type { BuilderUIMessage } from "@/lib/types";

function ToolBadge({
  name,
  state,
  detail,
}: {
  name: string;
  state: string;
  detail?: string;
}) {
  const labels: Record<string, string> = {
    writeFiles: "Writing files",
    readFile: "Reading file",
    listFiles: "Listing files",
  };
  const label = labels[name] ?? name;
  const isRunning =
    state === "input-streaming" ||
    state === "input-available" ||
    state === "running";
  const isDone = state === "output-available";
  const isError = state === "output-error";

  return (
    <div className="my-1 rounded-lg border border-zinc-700/60 bg-zinc-900/60 px-3 py-2 text-xs">
      <div className="flex items-center gap-2 text-zinc-300">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            isDone
              ? "bg-emerald-500"
              : isError
                ? "bg-red-500"
                : "animate-pulse bg-indigo-400"
          }`}
        />
        <span>{label}</span>
        {isDone && <span className="text-emerald-500">done</span>}
        {isError && <span className="text-red-400">failed</span>}
        {isRunning && <span className="text-indigo-400">running...</span>}
      </div>
      {detail && (
        <p className="mt-1 truncate font-mono text-[11px] text-zinc-500">
          {detail}
        </p>
      )}
    </div>
  );
}

function getToolDetail(part: Record<string, unknown>): string | undefined {
  if ("input" in part && part.input && typeof part.input === "object") {
    const input = part.input as Record<string, unknown>;
    if (Array.isArray(input.files)) {
      return (input.files as Array<{ path?: string }>)
        .map((f) => f.path)
        .filter(Boolean)
        .join(", ");
    }
    if (typeof input.path === "string") return input.path;
  }
  return undefined;
}

export function renderMessageParts(message: BuilderUIMessage) {
  return message.parts.map((part, i) => {
    if (part.type === "text") {
      return (
        <p key={`${message.id}-${i}`} className="whitespace-pre-wrap">
          {part.text}
        </p>
      );
    }
    if (part.type.startsWith("tool-")) {
      const toolName = part.type.replace("tool-", "");
      const state = "state" in part ? String(part.state) : "running";
      const detail = getToolDetail(part as unknown as Record<string, unknown>);
      return (
        <ToolBadge
          key={`${message.id}-${i}`}
          name={toolName}
          state={state}
          detail={detail}
        />
      );
    }
    return null;
  });
}
