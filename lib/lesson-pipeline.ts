import type { ModelMessage, UIMessageStreamWriter } from "ai";
import { getChatModel } from "./ai";
import type { AppCredentials } from "./credentials";
import type { EditToolEvent } from "./edit-tools";
import { runEditWithTools } from "./generate-edit";
import type {
  GenerationPromptContext,
  LessonEditOutput,
  LessonOutput,
  PartialLessonOutput,
} from "./generate-site";
import { streamLessonFromMessages } from "./generate-site";
import {
  filesToRecord,
  isValidEditOutput,
  mergeLessonEdits,
  mergedToLessonOutput,
  type LessonEditResult,
  type LessonResult,
} from "./lesson-edits";
import {
  buildFailureSummary,
  repairLesson,
  type RepairContext,
} from "./lesson-repair";
import {
  runLessonSmokeTest,
  skippedSmokeTest,
  type SmokeTestResult,
} from "./lesson-smoke-test";
import {
  formatValidationReport,
  lessonResultToRecord,
  validateLesson,
  type ValidationResult,
} from "./lesson-validator";
import { FALLBACK_MODEL_ID } from "./models";
import type { LogLine } from "./sandbox-logs";
import { createLogLine } from "./sandbox-logs";
import {
  ensurePreviewServer,
  getProjectSandbox,
  writeProjectFiles,
} from "./sandbox";
import type { BuilderUIMessage } from "./types";

export type LessonPipelineContext = {
  writer: UIMessageStreamWriter<BuilderUIMessage>;
  modelId?: string;
  credentials?: AppCredentials;
  modelMessages: ModelMessage[];
  existingFiles: Record<string, string>;
  promptContext: GenerationPromptContext;
  sandboxAvailable: boolean;
  projectId: string;
  maxRepairAttempts?: number;
};

export type LessonPipelineResult = {
  site: LessonResult;
  changedPaths: Array<{ path: string; content: string }>;
  usedTools: boolean;
  validationReport: ValidationResult;
  smokeResult?: SmokeTestResult;
  previewUrl?: string;
  validationFailed: boolean;
};

const STREAM_EMIT_MS = 60;

function emitFileContent(
  writer: UIMessageStreamWriter<BuilderUIMessage>,
  path: string,
  content: string,
  streaming: boolean,
) {
  writer.write({
    type: "data-fileContent",
    data: { path, content, streaming },
  });
}

function emitLog(
  writer: UIMessageStreamWriter<BuilderUIMessage>,
  line: LogLine,
) {
  writer.write({
    type: "data-log",
    data: line,
  });
}

function logText(
  writer: UIMessageStreamWriter<BuilderUIMessage>,
  stream: LogLine["stream"],
  text: string,
) {
  emitLog(writer, createLogLine(stream, text));
}

function emitStatus(
  writer: UIMessageStreamWriter<BuilderUIMessage>,
  message: string,
) {
  writer.write({
    type: "data-status",
    data: { message },
    transient: true,
  });
}

function isValidLessonOutput(site: LessonOutput | undefined): site is LessonOutput {
  if (
    !site?.files?.length ||
    !site.files.some(
      (f) => f.path?.trim() && f.content?.trim() && f.content.length > 20,
    )
  ) {
    return false;
  }
  return validateLesson(filesToRecord(site.files)).ok;
}

function resolveLessonOutput(
  raw: LessonOutput | LessonEditOutput,
  existingFiles: Record<string, string>,
  isEdit: boolean,
): LessonResult | null {
  if (isEdit) {
    const edit = raw as LessonEditOutput;
    if (!isValidEditOutput(edit as LessonEditResult)) return null;
    const merged = mergeLessonEdits(existingFiles, edit);
    const site = mergedToLessonOutput(
      merged,
      edit.summary,
      edit.librariesUsed,
    );
    return validateLesson(lessonResultToRecord(site.files)).ok ? site : null;
  }
  const created = raw as LessonOutput;
  return isValidLessonOutput(created) ? created : null;
}

async function streamPartialFiles(
  writer: UIMessageStreamWriter<BuilderUIMessage>,
  partialStream: AsyncIterable<PartialLessonOutput | Record<string, unknown>>,
) {
  const lastLengths: Record<string, number> = {};
  let lastEmitAt = 0;
  let activePath: string | undefined;

  for await (const partial of partialStream) {
    const p = partial as PartialLessonOutput;
    const batch = p?.changedFiles ?? p?.files;
    if (!Array.isArray(batch) || batch.length === 0) continue;

    const now = Date.now();
    let emitted = false;

    for (const file of batch) {
      if (!file?.path) continue;
      const content = file.content ?? "";
      activePath = file.path;

      const prevLen = lastLengths[file.path] ?? 0;
      const grew = content.length > prevLen;
      const throttleReady = now - lastEmitAt >= STREAM_EMIT_MS;

      if (!grew && !throttleReady) continue;

      lastLengths[file.path] = content.length;
      emitFileContent(writer, file.path, content, true);
      emitted = true;
    }

    if (emitted) {
      lastEmitAt = now;
      emitStatus(
        writer,
        activePath ? `Editing ${activePath}…` : "Applying edits…",
      );
    }
  }
}

async function runToolEditWithFallback(
  writer: UIMessageStreamWriter<BuilderUIMessage>,
  modelId: string | undefined,
  credentials: AppCredentials | undefined,
  modelMessages: ModelMessage[],
  existingFiles: Record<string, string>,
  promptContext: GenerationPromptContext,
): Promise<{ site: LessonResult; changedPaths: string[] } | null> {
  const modelsToTry = [
    modelId ?? FALLBACK_MODEL_ID,
    ...(modelId !== FALLBACK_MODEL_ID ? [FALLBACK_MODEL_ID] : []),
  ];

  for (let i = 0; i < modelsToTry.length; i++) {
    const id = modelsToTry[i];
    if (i > 0) {
      emitStatus(writer, "Retrying edit with Gemini 2.5 Flash…");
    }

    const onEvent = (event: EditToolEvent) => {
      if (event.type === "log") emitLog(writer, event.line);
      if (event.type === "fileWritten") {
        emitFileContent(writer, event.path, event.content, true);
        emitStatus(writer, `Editing ${event.path}…`);
      }
    };

    try {
      const model = getChatModel(id, credentials);
      const editResult = await runEditWithTools(
        model,
        modelMessages,
        existingFiles,
        onEvent,
        promptContext,
      );
      if (editResult) {
        return {
          site: editResult.result,
          changedPaths: editResult.changedPaths,
        };
      }
    } catch (error) {
      logText(
        writer,
        "stderr",
        error instanceof Error ? error.message : "Tool edit failed",
      );
    }
  }

  return null;
}

async function generateStructuredWithFallback(
  writer: UIMessageStreamWriter<BuilderUIMessage>,
  modelId: string | undefined,
  credentials: AppCredentials | undefined,
  modelMessages: ModelMessage[],
  existingFiles: Record<string, string>,
  isEdit: boolean,
  promptContext: GenerationPromptContext,
): Promise<LessonResult> {
  const modelsToTry = [
    modelId ?? FALLBACK_MODEL_ID,
    ...(modelId !== FALLBACK_MODEL_ID ? [FALLBACK_MODEL_ID] : []),
  ];

  let lastError: Error | undefined;

  for (let i = 0; i < modelsToTry.length; i++) {
    const id = modelsToTry[i];
    if (i > 0) {
      emitStatus(writer, "Retrying with Gemini 2.5 Flash…");
    }

    try {
      const model = getChatModel(id, credentials);
      const result = streamLessonFromMessages(
        model,
        modelMessages,
        isEdit ? existingFiles : undefined,
        promptContext,
      );
      await streamPartialFiles(writer, result.partialOutputStream);
      const raw = await result.output;
      const site = raw
        ? resolveLessonOutput(raw, existingFiles, isEdit)
        : null;
      if (site) {
        return site;
      }
      lastError = new Error("No output generated.");
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error("Generation failed");
    }
  }

  throw lastError ?? new Error("No output generated.");
}

async function generateLesson(
  writer: UIMessageStreamWriter<BuilderUIMessage>,
  ctx: LessonPipelineContext,
): Promise<{
  site: LessonResult;
  changedPaths: Array<{ path: string; content: string }>;
  usedTools: boolean;
}> {
  const {
    modelId,
    credentials,
    modelMessages,
    existingFiles,
    promptContext,
  } = ctx;
  const isEdit = Object.keys(existingFiles).length > 0;

  if (isEdit) {
    logText(writer, "system", "Edit mode: using readFile / writeFile tools");
    const toolResult = await runToolEditWithFallback(
      writer,
      modelId,
      credentials,
      modelMessages,
      existingFiles,
      promptContext,
    );
    if (toolResult) {
      const changedPaths = toolResult.changedPaths.map((path) => ({
        path,
        content: toolResult.site.files.find((f) => f.path === path)!.content,
      }));
      return { site: toolResult.site, changedPaths, usedTools: true };
    }
    logText(
      writer,
      "system",
      "Tool edit produced no changes — falling back to structured edit",
    );
  }

  const site = await generateStructuredWithFallback(
    writer,
    modelId,
    credentials,
    modelMessages,
    existingFiles,
    isEdit,
    promptContext,
  );

  const changedPaths = isEdit
    ? site.files.filter((f) => existingFiles[f.path] !== f.content)
    : site.files;

  return { site, changedPaths, usedTools: false };
}

function logValidationIssues(
  writer: UIMessageStreamWriter<BuilderUIMessage>,
  validation: ValidationResult,
) {
  for (const issue of validation.issues) {
    const loc = issue.line
      ? `${issue.path}:${issue.line}`
      : issue.path ?? "lesson";
    logText(
      writer,
      issue.severity === "error" ? "stderr" : "system",
      `[${issue.code}] ${loc} — ${issue.message}`,
    );
  }
}

async function validateAndSmoke(
  writer: UIMessageStreamWriter<BuilderUIMessage>,
  files: Record<string, string>,
  ctx: LessonPipelineContext,
): Promise<{
  validation: ValidationResult;
  smoke: SmokeTestResult;
  previewUrl?: string;
}> {
  emitStatus(writer, "Validating lesson…");
  const validation = validateLesson(files);

  if (validation.ok) {
    logText(writer, "system", "Static validation passed");
  } else {
    const errorCount = validation.issues.filter((i) => i.severity === "error").length;
    logText(writer, "stderr", `Validation failed (${errorCount} errors)`);
    logValidationIssues(writer, validation);
  }

  let smoke: SmokeTestResult;
  let previewUrl: string | undefined;

  if (!validation.ok) {
    return { validation, smoke: skippedSmokeTest("Skipped — static validation failed") };
  }

  if (!ctx.sandboxAvailable) {
    smoke = skippedSmokeTest("Sandbox unavailable — smoke test skipped");
    logText(writer, "system", smoke.issues[0]?.message ?? "Smoke test skipped");
    return { validation, smoke };
  }

  try {
    const { sandbox } = await getProjectSandbox(ctx.projectId, ctx.credentials);
    const onLog = (line: LogLine) => emitLog(writer, line);
    smoke = await runLessonSmokeTest(sandbox, files, onLog);
    previewUrl = smoke.previewUrl;

    if (smoke.skipped) {
      logText(writer, "system", smoke.issues[0]?.message ?? "Smoke test skipped");
    } else if (smoke.ok) {
      logText(writer, "system", "Smoke test passed");
    } else {
      logText(writer, "stderr", "Smoke test failed");
      for (const issue of smoke.issues) {
        logText(writer, "stderr", `[${issue.code}] ${issue.message}`);
      }
    }
  } catch (err) {
    smoke = skippedSmokeTest(
      err instanceof Error ? err.message : "Smoke test error",
    );
    logText(writer, "system", smoke.issues[0]?.message ?? "Smoke test skipped");
  }

  return { validation, smoke, previewUrl };
}

export async function runLessonPipeline(
  ctx: LessonPipelineContext,
): Promise<LessonPipelineResult> {
  const maxRepairAttempts = ctx.maxRepairAttempts ?? 2;
  const { writer } = ctx;

  const generated = await generateLesson(writer, ctx);
  let site = generated.site;
  let changedPaths = generated.changedPaths;
  let usedTools = generated.usedTools;
  let files = lessonResultToRecord(site.files);

  let { validation: validationReport, smoke: smokeResult, previewUrl } =
    await validateAndSmoke(writer, files, ctx);

  let repairAttempt = 0;

  while (
    repairAttempt < maxRepairAttempts &&
    (!validationReport.ok || (!smokeResult.ok && !smokeResult.skipped))
  ) {
    repairAttempt += 1;
    const errorCount =
      validationReport.issues.filter((i) => i.severity === "error").length +
      smokeResult.issues.filter((i) => i.severity === "error").length;

    emitStatus(
      writer,
      `Validation failed (${errorCount} errors) — repair attempt ${repairAttempt}/${maxRepairAttempts}`,
    );
    logText(writer, "system", "Starting AI repair pass…");

    const onEvent = (event: EditToolEvent) => {
      if (event.type === "log") emitLog(writer, event.line);
      if (event.type === "fileWritten") {
        emitFileContent(writer, event.path, event.content, true);
        emitStatus(writer, `Repairing ${event.path}…`);
      }
    };

    const repairCtx: RepairContext = {
      modelId: ctx.modelId,
      credentials: ctx.credentials,
      modelMessages: ctx.modelMessages,
      promptContext: ctx.promptContext,
      onEvent,
      attempt: repairAttempt,
      maxAttempts: maxRepairAttempts,
    };

    const repaired = await repairLesson(
      files,
      validationReport.issues,
      smokeResult,
      repairCtx,
    );

    if (!repaired) {
      logText(writer, "stderr", "Repair pass produced no changes");
      break;
    }

    site = repaired.site;
    usedTools = true;
    files = lessonResultToRecord(site.files);
    changedPaths = repaired.changedPaths.map((path) => ({
      path,
      content: site.files.find((f) => f.path === path)!.content,
    }));

    ({ validation: validationReport, smoke: smokeResult, previewUrl } =
      await validateAndSmoke(writer, files, ctx));
  }

  const validationFailed =
    !validationReport.ok || (!smokeResult.ok && !smokeResult.skipped);

  if (validationFailed) {
    logText(
      writer,
      "stderr",
      `Validation incomplete after ${repairAttempt} repair attempt(s)`,
    );
    const report = formatValidationReport([
      ...validationReport.issues,
      ...smokeResult.issues,
    ]);
    if (report) logText(writer, "stderr", report);
  } else {
    emitStatus(writer, "Lesson validated");
    logText(writer, "system", "Lesson validated successfully");
  }

  if (ctx.sandboxAvailable && previewUrl) {
    // Files already written during smoke test
  } else if (ctx.sandboxAvailable && !previewUrl) {
    try {
      const { sandbox } = await getProjectSandbox(ctx.projectId, ctx.credentials);
      const onLog = (line: LogLine) => emitLog(writer, line);
      await writeProjectFiles(sandbox, site.files, onLog);
      previewUrl = await ensurePreviewServer(sandbox, {
        force: true,
        onLog,
      });
      previewUrl = `${previewUrl}?v=${Date.now()}`;
    } catch (err) {
      logText(
        writer,
        "stderr",
        err instanceof Error ? err.message : "Sandbox write failed",
      );
    }
  }

  if (validationFailed) {
    site = {
      ...site,
      summary: `${site.summary}${buildFailureSummary(validationReport.issues, smokeResult)}`,
    };
  }

  return {
    site,
    changedPaths,
    usedTools,
    validationReport,
    smokeResult,
    previewUrl,
    validationFailed,
  };
}
