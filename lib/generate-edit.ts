import { stepCountIs, streamText } from "ai";
import type { LanguageModel, ModelMessage } from "ai";
import { AUTHORING_SYSTEM_PROMPT } from "./authoring-prompt";
import {
  createEditTools,
  EDIT_TOOL_SYSTEM_PROMPT,
  type EditToolEvent,
} from "./edit-tools";
import { buildFileInventory } from "./lesson-edits";
import type { LessonResult } from "./lesson-edits";

function buildEditToolPrompt(existingFiles: Record<string, string>): string {
  const inventory = buildFileInventory(existingFiles);
  return `${AUTHORING_SYSTEM_PROMPT}

${EDIT_TOOL_SYSTEM_PROMPT}

## Files in this lesson
${inventory}`;
}

export async function runEditWithTools(
  model: LanguageModel,
  messages: ModelMessage[],
  existingFiles: Record<string, string>,
  onEvent: (event: EditToolEvent) => void,
): Promise<{ result: LessonResult; changedPaths: string[] } | null> {
  const workingFiles = { ...existingFiles };
  const modifiedPaths = new Set<string>();
  const tools = createEditTools(workingFiles, modifiedPaths, onEvent);

  const response = streamText({
    model,
    system: buildEditToolPrompt(existingFiles),
    messages,
    tools,
    stopWhen: stepCountIs(12),
  });

  for await (const part of response.fullStream) {
    if (part.type === "text-delta") {
      onEvent({ type: "textDelta", delta: part.text });
    }
  }

  const summary = (await response.text).trim();
  const changedPaths = [...modifiedPaths];

  if (changedPaths.length === 0) {
    return null;
  }

  return {
    result: {
      files: Object.entries(workingFiles)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([path, content]) => ({ path, content })),
      summary:
        summary ||
        `Updated ${changedPaths.join(", ")}`,
    },
    changedPaths,
  };
}
