import { tool } from "ai";
import { z } from "zod";
import type { LogLine } from "./sandbox-logs";
import { createLogLine } from "./sandbox-logs";

export type EditToolEvent =
  | { type: "log"; line: LogLine }
  | { type: "fileWritten"; path: string; content: string }
  | { type: "textDelta"; delta: string };

function emitLog(
  onEvent: (event: EditToolEvent) => void,
  stream: LogLine["stream"],
  text: string,
) {
  onEvent({ type: "log", line: createLogLine(stream, text) });
}

export function createEditTools(
  files: Record<string, string>,
  modifiedPaths: Set<string>,
  onEvent: (event: EditToolEvent) => void,
) {
  return {
    listFiles: tool({
      description: "List all files in the current lesson project.",
      inputSchema: z.object({}),
      execute: async () => {
        emitLog(onEvent, "system", "Listing project files…");
        const paths = Object.keys(files).sort();
        return { files: paths, count: paths.length };
      },
    }),

    readFile: tool({
      description:
        "Read the full contents of a lesson file. Always read a file before editing it.",
      inputSchema: z.object({
        path: z.string().describe("Relative path, e.g. scene.js or styles.css"),
      }),
      execute: async ({ path }) => {
        const content = files[path];
        if (content === undefined) {
          emitLog(onEvent, "stderr", `File not found: ${path}`);
          return { error: `File not found: ${path}`, path };
        }
        const lines = content.split("\n").length;
        emitLog(onEvent, "system", `Read ${path} (${lines} lines)`);
        return { path, content, lines };
      },
    }),

    writeFile: tool({
      description:
        "Write one lesson file with complete updated content. Only call this for files you changed. Copy unchanged lines verbatim from readFile.",
      inputSchema: z.object({
        path: z.string().describe("Relative path to write"),
        content: z
          .string()
          .describe("Complete file content after your edit"),
      }),
      execute: async ({ path, content }) => {
        const lines = content.split("\n").length;
        files[path] = content;
        modifiedPaths.add(path);
        emitLog(onEvent, "stdout", `Wrote ${path} (${lines} lines)`);
        onEvent({ type: "fileWritten", path, content });
        return {
          success: true,
          path,
          lines,
          message: `Updated ${path}`,
        };
      },
    }),
  };
}

export const EDIT_TOOL_SYSTEM_PROMPT = `You are in EDIT MODE. Use tools to make surgical changes — do NOT return JSON.

## Required workflow
1. **listFiles** or **readFile** — inspect only what you need
2. **readFile** — read every file before you change it
3. **writeFile** — write ONLY files you modified (complete file content, unchanged lines copied verbatim)
4. Finish with a brief plain-text summary of what you changed

## Rules
- Minimum change: fix only what the user asked for
- Never rewrite unrelated files or refactor working code
- Preserve ScormAuthor calls, Three.js setup, imports, and event handlers
- If one file suffices, touch only that file
- Do not call writeFile on files you did not change`;
