import type { ModelMessage } from "ai";
import type { AppCredentials } from "./credentials";
import { getChatModel } from "./ai";
import { runEditWithTools } from "./generate-edit";
import type { EditToolEvent } from "./edit-tools";
import type { GenerationPromptContext } from "./generate-site";
import type { LessonResult } from "./lesson-edits";
import {
  formatValidationReport,
  type ValidationIssue,
} from "./lesson-validator";
import type { SmokeTestResult } from "./lesson-smoke-test";
import { FALLBACK_MODEL_ID } from "./models";

export type RepairContext = {
  modelId?: string;
  credentials?: AppCredentials;
  modelMessages: ModelMessage[];
  promptContext: GenerationPromptContext;
  onEvent: (event: EditToolEvent) => void;
  attempt: number;
  maxAttempts: number;
};

function buildRepairInstructions(
  validationIssues: ValidationIssue[],
  smokeResult?: SmokeTestResult,
): string {
  const lines: string[] = [
    "## REPAIR MODE — fix validation errors only",
    "Use readFile then writeFile. Fix ONLY the listed issues.",
    "Do not rewrite unrelated files or refactor working code.",
    "",
    "Errors to fix:",
  ];

  for (const issue of validationIssues.filter((i) => i.severity === "error")) {
    const loc = issue.line
      ? `${issue.path}:${issue.line}`
      : issue.path ?? "lesson";
    lines.push(`- ${loc} — ${issue.message}`);
  }

  if (smokeResult && !smokeResult.ok && !smokeResult.skipped) {
    for (const issue of smokeResult.issues) {
      const loc = issue.path ?? "preview";
      lines.push(`- [smoke] ${loc} — ${issue.message}`);
    }
  }

  return lines.join("\n");
}

export async function repairLesson(
  files: Record<string, string>,
  validationIssues: ValidationIssue[],
  smokeResult: SmokeTestResult | undefined,
  ctx: RepairContext,
): Promise<{ site: LessonResult; changedPaths: string[] } | null> {
  const repairInstructions = buildRepairInstructions(
    validationIssues,
    smokeResult,
  );

  const repairPromptContext: GenerationPromptContext = {
    ...ctx.promptContext,
    mode: "edit",
    existingFiles: files,
    conversationContext: [
      ctx.promptContext.conversationContext,
      repairInstructions,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };

  const modelsToTry = [
    ctx.modelId ?? FALLBACK_MODEL_ID,
    ...(ctx.modelId !== FALLBACK_MODEL_ID ? [FALLBACK_MODEL_ID] : []),
  ];

  for (const id of modelsToTry) {
    try {
      const model = getChatModel(id, ctx.credentials);
      const result = await runEditWithTools(
        model,
        ctx.modelMessages,
        files,
        ctx.onEvent,
        repairPromptContext,
      );
      if (result) {
        return {
          site: result.result,
          changedPaths: result.changedPaths,
        };
      }
    } catch {
      // try fallback model
    }
  }

  return null;
}

export function buildFailureSummary(
  validationIssues: ValidationIssue[],
  smokeResult?: SmokeTestResult,
): string {
  const report = formatValidationReport([
    ...validationIssues,
    ...(smokeResult?.issues ?? []),
  ]);
  if (!report) return "";
  return `\n\nSome validation issues remain:\n${report}`;
}
