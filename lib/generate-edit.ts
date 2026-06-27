import { stepCountIs, streamText } from "ai";
import type { LanguageModel, ModelMessage } from "ai";
import { buildAuthoringSystemPrompt } from "./authoring-prompt";
import {
  createEditTools,
  EDIT_TOOL_SYSTEM_PROMPT,
  type EditToolEvent,
} from "./edit-tools";
import type { GenerationPromptContext } from "./generate-site";
import { buildFileInventory } from "./lesson-edits";
import type { LessonResult } from "./lesson-edits";
import { appendContextToSystem } from "./message-context";

function buildEditToolPrompt(ctx: GenerationPromptContext): string {
  const existingFiles = ctx.existingFiles ?? {};
  const { system } = buildAuthoringSystemPrompt({
    userMessage: ctx.userMessage,
    recentUserText: ctx.recentUserText,
    existingFiles,
    mode: "edit",
  });

  const inventory = buildFileInventory(existingFiles);

  return appendContextToSystem(
    `${system}

${EDIT_TOOL_SYSTEM_PROMPT}

## Files in this lesson
${inventory}`,
    ctx.conversationContext,
  );
}

export async function runEditWithTools(
  model: LanguageModel,
  messages: ModelMessage[],
  existingFiles: Record<string, string>,
  onEvent: (event: EditToolEvent) => void,
  promptContext?: GenerationPromptContext,
): Promise<{ result: LessonResult; changedPaths: string[] } | null> {
  const workingFiles = { ...existingFiles };
  const modifiedPaths = new Set<string>();
  const tools = createEditTools(workingFiles, modifiedPaths, onEvent);

  const ctx: GenerationPromptContext = {
    userMessage: promptContext?.userMessage ?? "",
    recentUserText: promptContext?.recentUserText,
    existingFiles,
    mode: "edit",
    conversationContext: promptContext?.conversationContext,
  };

  const response = streamText({
    model,
    system: buildEditToolPrompt(ctx),
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
      summary: summary || `Updated ${changedPaths.join(", ")}`,
    },
    changedPaths,
  };
}
