import { Output, streamText } from "ai";
import type { LanguageModel, ModelMessage } from "ai";
import { z } from "zod";
import { AUTHORING_SYSTEM_PROMPT } from "./authoring-prompt";
import { buildFileInventory } from "./lesson-edits";
import { buildFilesContext } from "./project-storage";

export const lessonOutputSchema = z.object({
  files: z
    .array(
      z.object({
        path: z
          .string()
          .describe(
            "Relative path, e.g. index.html, styles.css, script.js, scene.js",
          ),
        content: z.string().describe("Complete file content"),
      }),
    )
    .min(1)
    .max(15),
  summary: z
    .string()
    .describe("Brief summary of the interactive lesson created"),
  librariesUsed: z
    .array(z.string())
    .optional()
    .describe("CDN libraries used, e.g. three, gsap, r3f"),
});

export const lessonEditOutputSchema = z.object({
  changedFiles: z
    .array(
      z.object({
        path: z
          .string()
          .describe("Path of the file being edited, e.g. styles.css"),
        content: z
          .string()
          .describe(
            "Complete updated content for THIS file only — unchanged lines copied verbatim",
          ),
      }),
    )
    .min(1)
    .max(15)
    .describe("ONLY files you actually modified — omit all unchanged files"),
  deletedPaths: z
    .array(z.string())
    .optional()
    .describe("Paths to remove, only if user asked to delete a file"),
  summary: z
    .string()
    .describe("Brief summary of what was changed (1-2 sentences)"),
  librariesUsed: z
    .array(z.string())
    .optional()
    .describe("CDN libraries added or changed, if any"),
});

export type LessonOutput = z.infer<typeof lessonOutputSchema>;
export type LessonEditOutput = z.infer<typeof lessonEditOutputSchema>;
export type PartialLessonOutput = {
  files?: Array<{ path?: string; content?: string }>;
  changedFiles?: Array<{ path?: string; content?: string }>;
  summary?: string;
  librariesUsed?: string[];
};

/** @deprecated use lessonOutputSchema */
export const siteOutputSchema = lessonOutputSchema;
export type SiteOutput = LessonOutput;

function buildCreatePrompt(): string {
  return `${AUTHORING_SYSTEM_PROMPT}

You MUST return JSON: { "files": [...], "summary": "...", "librariesUsed": [...] }
Always include index.html. Never return empty or placeholder content.`;
}

function buildEditPrompt(existingFiles: Record<string, string>): string {
  const inventory = buildFileInventory(existingFiles);
  const fileContext = buildFilesContext(existingFiles);

  return `${AUTHORING_SYSTEM_PROMPT}

EDIT MODE — surgical update only.

## Files in this lesson
${inventory}

## Current file contents (copy unchanged lines verbatim when editing)
${fileContext}

You MUST return JSON:
{
  "changedFiles": [{ "path": "...", "content": "..." }],
  "deletedPaths": [],
  "summary": "...",
  "librariesUsed": []
}

Return ONLY files you modified in changedFiles. Omit every unchanged file.`;
}

export function streamLessonFromMessages(
  model: LanguageModel,
  messages: ModelMessage[],
  existingFiles?: Record<string, string>,
) {
  const isEdit = Boolean(existingFiles && Object.keys(existingFiles).length > 0);

  if (isEdit) {
    return streamText({
      model,
      output: Output.object({ schema: lessonEditOutputSchema }),
      system: buildEditPrompt(existingFiles!),
      messages,
    });
  }

  return streamText({
    model,
    output: Output.object({ schema: lessonOutputSchema }),
    system: buildCreatePrompt(),
    messages,
  });
}

/** @deprecated use streamLessonFromMessages */
export async function generateLessonFromMessages(
  model: LanguageModel,
  messages: ModelMessage[],
  existingFiles?: Record<string, string>,
): Promise<LessonOutput> {
  const result = streamLessonFromMessages(model, messages, existingFiles);
  const output = await result.output;
  if (!output) {
    throw new Error("Model returned no output. Try again or switch models.");
  }
  return output as LessonOutput;
}

/** @deprecated use streamLessonFromMessages */
export const generateSiteFromMessages = generateLessonFromMessages;
