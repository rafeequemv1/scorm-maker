"use client";

import { useEffect, useRef } from "react";
import { AUTHORING_LIBRARIES } from "@/lib/authoring-libraries";
import type { BuilderUIMessage } from "@/lib/types";
import { renderMessageParts } from "./chat-message-parts";

interface ChatPanelProps {
  messages: BuilderUIMessage[];
  input: string;
  setInput: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isGenerating: boolean;
  error?: string | null;
  buildStatus?: string | null;
  hasExistingLesson?: boolean;
}

const CREATE_SUGGESTIONS = [
  "Create a fire safety quiz with 5 multiple-choice questions and instant feedback",
  "Build a 3D solar system explorer with Three.js that learners can orbit",
  "Make a drag-and-drop anatomy labeling activity with scoring",
  "Design a branching customer service scenario with pass/fail at the end",
];

const EDIT_SUGGESTIONS = [
  "Fix the quiz so wrong answers show the correct explanation",
  "Change the color scheme to blue and white corporate style",
  "Add one more quiz question about topic X",
  "Make the 3D scene rotate slower and add labels to each part",
];

const LIBRARY_CHIPS = ["three", "r3f", "gsap", "matter", "chartjs"];

export function ChatPanel({
  messages,
  input,
  setInput,
  onSubmit,
  isGenerating,
  error,
  buildStatus,
  hasExistingLesson = false,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isGenerating, buildStatus]);

  const appendLibrary = (libId: string) => {
    const lib = AUTHORING_LIBRARIES.find((l) => l.id === libId);
    if (!lib) return;
    const hint = `Use ${lib.name} for this lesson. `;
    setInput(input.trim() ? `${input.trim()} ${hint}` : hint);
  };

  const suggestions = hasExistingLesson ? EDIT_SUGGESTIONS : CREATE_SUGGESTIONS;

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const hasAssistantContent = Boolean(
    lastAssistant?.parts.some(
      (p) =>
        (p.type === "text" && p.text.trim()) ||
        (typeof p.type === "string" && p.type.startsWith("tool-")),
    ),
  );

  return (
    <div className="flex h-full min-h-0 w-full max-w-md shrink-0 flex-col overflow-hidden border-r border-zinc-800 lg:max-w-lg xl:max-w-xl">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col justify-center gap-6 py-8">
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">
                What interactive lesson should we build?
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Describe quizzes, simulations, 3D scenes (Three.js / R3F), or
                branching scenarios — export as SCORM 1.2 when ready.
              </p>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-600">
                Libraries
              </p>
              <div className="flex flex-wrap gap-1.5">
                {LIBRARY_CHIPS.map((id) => {
                  const lib = AUTHORING_LIBRARIES.find((l) => l.id === id);
                  if (!lib) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => appendLibrary(id)}
                      className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-400 transition hover:border-indigo-600 hover:text-indigo-300"
                    >
                      {lib.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {suggestions.map((suggestion) => (
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
                  {renderMessageParts(message)}
                </div>
              </div>
            ))}
            {isGenerating && !hasAssistantContent && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-zinc-800/80 px-4 py-3 text-sm text-zinc-400">
                  <div className="flex items-center gap-2">
                    <span className="flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:300ms]" />
                    </span>
                    {buildStatus ?? "Authoring lesson..."}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="shrink-0 border-t border-zinc-800 p-4"
      >
        {error && (
          <div className="mb-3 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
        {hasExistingLesson && messages.length > 0 && !isGenerating && (
          <p className="mb-2 text-[10px] text-zinc-600">
            Edit mode — AI reads then writes only changed files via tools.
          </p>
        )}
        {hasExistingLesson && messages.length > 0 && !isGenerating && (
          <div className="mb-2 flex flex-wrap gap-1">
            {EDIT_SUGGESTIONS.slice(0, 2).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setInput(s)}
                className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[10px] text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
              >
                {s.slice(0, 42)}…
              </button>
            ))}
          </div>
        )}
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
            placeholder={
              hasExistingLesson
                ? "Describe a fix or change to this lesson..."
                : "Describe your interactive SCORM lesson..."
            }
            rows={2}
            disabled={isGenerating}
            className="flex-1 resize-none bg-transparent px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isGenerating}
            className="self-end rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isGenerating ? "..." : hasExistingLesson ? "Update" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
