import { generateText, Output } from "ai";
import type { LanguageModel, ModelMessage } from "ai";
import { z } from "zod";
import { AUTHORING_SYSTEM_PROMPT } from "./authoring-prompt";

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

export type LessonOutput = z.infer<typeof lessonOutputSchema>;

/** @deprecated use lessonOutputSchema */
export const siteOutputSchema = lessonOutputSchema;
export type SiteOutput = LessonOutput;

export async function generateLessonFromMessages(
  model: LanguageModel,
  messages: ModelMessage[],
  existingFilesContext?: string,
): Promise<LessonOutput> {
  const system = `${AUTHORING_SYSTEM_PROMPT}

You MUST return JSON: { "files": [...], "summary": "...", "librariesUsed": [...] }
Always include index.html. Never return empty or placeholder content.`;

  const promptContext = existingFilesContext
    ? `\n\nExisting lesson files (update or extend these):\n${existingFilesContext}`
    : "";

  const { output } = await generateText({
    model,
    output: Output.object({ schema: lessonOutputSchema }),
    system: system + promptContext,
    messages,
  });

  if (!output) {
    throw new Error("Model returned no output. Try again or switch models.");
  }

  return output;
}

/** @deprecated use generateLessonFromMessages */
export const generateSiteFromMessages = generateLessonFromMessages;
