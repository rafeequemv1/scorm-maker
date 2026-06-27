import { tool } from "ai";
import { z } from "zod";
import type { Sandbox } from "@vercel/sandbox";
import {
  ensurePreviewServer,
  listProjectFiles,
  readProjectFile,
  writeProjectFiles,
} from "./sandbox";

export function createBuilderTools(sandbox: Sandbox) {
  return {
    writeFiles: tool({
      description:
        "Write or update website files in the sandbox. Use relative paths like index.html, styles.css, script.js. Always write complete file contents.",
      inputSchema: z.object({
        files: z
          .array(
            z.object({
              path: z.string().describe("Relative file path, e.g. index.html"),
              content: z.string().describe("Full file content"),
            }),
          )
          .min(1),
      }),
      execute: async ({ files }) => {
        const written = await writeProjectFiles(sandbox, files);
        const previewUrl = await ensurePreviewServer(sandbox);
        return {
          success: true,
          written,
          previewUrl,
          message: `Updated ${written.join(", ")}. Preview is live.`,
        };
      },
    }),

    readFile: tool({
      description: "Read the current contents of a file in the project.",
      inputSchema: z.object({
        path: z.string().describe("Relative file path to read"),
      }),
      execute: async ({ path }) => {
        const content = await readProjectFile(sandbox, path);
        return { path, content };
      },
    }),

    listFiles: tool({
      description: "List all files in the website project.",
      inputSchema: z.object({}),
      execute: async () => {
        const files = await listProjectFiles(sandbox);
        return { files };
      },
    }),
  };
}

export const BUILDER_SYSTEM_PROMPT = `You are SiteForge, an expert web developer AI that builds beautiful websites inside an isolated sandbox.

Rules:
- Build static websites using HTML, CSS, and vanilla JavaScript only (no React, no build tools).
- Use index.html as the entry point. Split CSS into styles.css and JS into script.js when helpful.
- Always write COMPLETE file contents when using writeFiles — never partial diffs or placeholders.
- Create modern, responsive, accessible designs with good typography, spacing, and color.
- Use semantic HTML, CSS custom properties, and smooth transitions where appropriate.
- When the user asks to change something, read existing files first if needed, then write updated files.
- Keep external dependencies minimal — prefer CSS and vanilla JS over CDN libraries unless requested.
- After making changes, briefly explain what you built or changed.`;
