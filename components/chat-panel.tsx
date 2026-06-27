"use client";

import { useEffect, useRef } from "react";
import type { BuilderUIMessage } from "@/lib/types";

interface ChatPanelProps {
  messages: BuilderUIMessage[];
  input: string;
  setInput: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isGenerating: boolean;
}

const SUGGESTIONS = [
  "Build a landing page for a coffee shop",
  "Create a portfolio site for a photographer",
  "Make a pricing page for a SaaS product",
  "Design a restaurant menu website",
];

function ToolBadge({ name, state }: { name: string; state: string }) {
  const labels: Record<string, string> = {
    writeFiles: "Writing files",
    readFile: "Reading file",
    listFiles: "Listing files",
  };
  const label = labels[name] ?? name;
  const isDone = state === "output-available" || state === "output-error";

  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-700/60 bg-zinc-800/40 px-3 py-2 text-xs text-zinc-400">
      <span
        className={`h-1.5 w-1.5 rounded-full ${isDone ? "bg-emerald-500" : "animate-pulse bg-indigo-400"}`}
      />
      {label}
      {isDone && <span className="text-emerald-500">✓</span>}
    </div>
  );
}

export function ChatPanel({
  messages,
  input,
  setInput,
  onSubmit,
  isGenerating,
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isGenerating]);

  return (
    <div className="flex w-full max-w-md shrink-0 flex-col border-r border-zinc-800 lg:max-w-lg xl:max-w-xl">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col justify-center gap-6 py-8">
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">
                What do you want to build?
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Describe your website and AI will generate it live in a secure
                Vercel Sandbox.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setInput(suggestion)}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-left text-sm text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800/50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    message.role === "user"
                      ? "bg-indigo-600 text-white"
                      : "bg-zinc-800/80 text-zinc-200"
                  }`}
                >
                  {message.parts.map((part, i) => {
                    if (part.type === "text") {
                      return (
                        <p key={`${message.id}-${i}`} className="whitespace-pre-wrap">
                          {part.text}
                        </p>
                      );
                    }
                    if (part.type.startsWith("tool-")) {
                      const toolName = part.type.replace("tool-", "");
                      const state =
                        "state" in part ? String(part.state) : "running";
                      return (
                        <ToolBadge
                          key={`${message.id}-${i}`}
                          name={toolName}
                          state={state}
                        />
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            ))}
            {isGenerating && messages.at(-1)?.role !== "assistant" && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl bg-zinc-800/80 px-4 py-3 text-sm text-zinc-400">
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:300ms]" />
                  </span>
                  Building...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="shrink-0 border-t border-zinc-800 p-4"
      >
        <div className="flex gap-2 rounded-xl border border-zinc-700 bg-zinc-900 p-2 focus-within:border-indigo-500/50">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit(e);
              }
            }}
            placeholder="Describe your website..."
            rows={2}
            disabled={isGenerating}
            className="flex-1 resize-none bg-transparent px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isGenerating}
            className="self-end rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isGenerating ? "..." : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
