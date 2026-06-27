import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  UIMessage,
  type UIMessageStreamWriter,
} from "ai";
import { getChatModel } from "@/lib/ai";
import type { AppCredentials } from "@/lib/credentials";
import { getProviderStatus, resolveCredentials } from "@/lib/credentials";
import {
  isValidEditOutput,
  mergeLessonEdits,
  mergedToLessonOutput,
  type LessonEditResult,
  type LessonResult,
} from "@/lib/lesson-edits";
import { runEditWithTools } from "@/lib/generate-edit";
import type { EditToolEvent } from "@/lib/edit-tools";
import type { LogLine } from "@/lib/sandbox-logs";
import {
  streamLessonFromMessages,
  type LessonEditOutput,
  type LessonOutput,
  type PartialLessonOutput,
} from "@/lib/generate-site";
import {
  ensurePreviewServer,
  getProjectSandbox,
  listProjectFiles,
  readProjectFile,
  writeProjectFiles,
} from "@/lib/sandbox";
import type { BuilderUIMessage } from "@/lib/types";
import { FALLBACK_MODEL_ID } from "@/lib/models";

export const maxDuration = 300;

const STREAM_EMIT_MS = 60;

async function loadExistingFiles(
  projectId: string,
  clientFiles?: Record<string, string>,
  credentials?: AppCredentials,
): Promise<Record<string, string>> {
  if (clientFiles && Object.keys(clientFiles).length > 0) {
    return clientFiles;
  }

  try {
    const { sandbox } = await getProjectSandbox(projectId, credentials);
    const paths = await listProjectFiles(sandbox);
    const sandboxFiles: Record<string, string> = {};
    for (const path of paths.slice(0, 12)) {
      try {
        sandboxFiles[path] = await readProjectFile(sandbox, path);
      } catch {
        // skip
      }
    }
    return sandboxFiles;
  } catch {
    return {};
  }
}

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

function emitFiles(
  writer: UIMessageStreamWriter<BuilderUIMessage>,
  files: Array<{ path: string; content: string }>,
  previewUrl?: string,
  streaming = false,
) {
  for (const file of files) {
    emitFileContent(writer, file.path, file.content, streaming);
  }
  if (!streaming) {
    writer.write({
      type: "data-files",
      data: { paths: files.map((f) => f.path) },
    });
  }
  if (previewUrl) {
    writer.write({
      type: "data-preview",
      data: { url: previewUrl, status: "ready" },
    });
  }
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

function emitAssistantText(
  writer: UIMessageStreamWriter<BuilderUIMessage>,
  text: string,
) {
  const id = "assistant-response";
  writer.write({ type: "text-start", id });
  writer.write({ type: "text-delta", id, delta: text });
  writer.write({ type: "text-end", id });
}

async function streamPartialFiles(
  writer: UIMessageStreamWriter<BuilderUIMessage>,
  partialStream: AsyncIterable<PartialLessonOutput | Record<string, unknown>>,
) {
  const lastLengths: Record<string, number> = {};
  let lastEmitAt = 0;
  let activePath: string | undefined;
  const seenPaths: string[] = [];

  for await (const partial of partialStream) {
    const p = partial as PartialLessonOutput;
    const batch = p?.changedFiles ?? p?.files;
    if (!Array.isArray(batch) || batch.length === 0) continue;

    const now = Date.now();
    let emitted = false;

    for (const file of batch) {
      if (!file?.path) continue;
      const content = file.content ?? "";
      if (!seenPaths.includes(file.path)) {
        seenPaths.push(file.path);
      }
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
      const lines = activePath
        ? (lastLengths[activePath] ? Math.max(1, contentLines(batch, activePath)) : 0)
        : 0;
      writer.write({
        type: "data-status",
        data: {
          message: activePath
            ? `Editing ${activePath}${lines ? ` · ${lines} lines` : "…"}`
            : "Applying edits…",
        },
        transient: true,
      });
    }
  }

  return { seenPaths, lastLengths };
}

function isValidLessonOutput(
  site: LessonOutput | undefined,
): site is LessonOutput {
  return Boolean(
    site?.files?.length &&
      site.files.some(
        (f) => f.path?.trim() && f.content?.trim() && f.content.length > 20,
      ),
  );
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
    return mergedToLessonOutput(
      merged,
      edit.summary,
      edit.librariesUsed,
    );
  }
  const created = raw as LessonOutput;
  return isValidLessonOutput(created) ? created : null;
}

async function runToolEditWithFallback(
  writer: UIMessageStreamWriter<BuilderUIMessage>,
  modelId: string | undefined,
  credentials: AppCredentials | undefined,
  modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>,
  existingFiles: Record<string, string>,
): Promise<{ site: LessonResult; changedPaths: string[] } | null> {
  const modelsToTry = [
    modelId ?? FALLBACK_MODEL_ID,
    ...(modelId !== FALLBACK_MODEL_ID ? [FALLBACK_MODEL_ID] : []),
  ];

  for (let i = 0; i < modelsToTry.length; i++) {
    const id = modelsToTry[i];
    if (i > 0) {
      writer.write({
        type: "data-status",
        data: { message: "Retrying edit with Gemini 2.5 Flash…" },
        transient: true,
      });
    }

    const onEvent = (event: EditToolEvent) => {
      if (event.type === "log") emitLog(writer, event.line);
      if (event.type === "fileWritten") {
        emitFileContent(writer, event.path, event.content, true);
        writer.write({
          type: "data-status",
          data: { message: `Editing ${event.path}…` },
          transient: true,
        });
      }
    };

    try {
      const model = getChatModel(id, credentials);
      const editResult = await runEditWithTools(
        model,
        modelMessages,
        existingFiles,
        onEvent,
      );
      if (editResult) {
        return {
          site: editResult.result,
          changedPaths: editResult.changedPaths,
        };
      }
    } catch (error) {
      emitLog(
        writer,
        {
          stream: "stderr",
          text:
            error instanceof Error ? error.message : "Tool edit failed",
          timestamp: Date.now(),
        },
      );
    }
  }

  return null;
}

async function generateStructuredWithFallback(
  writer: UIMessageStreamWriter<BuilderUIMessage>,
  modelId: string | undefined,
  credentials: AppCredentials | undefined,
  modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>,
  existingFiles: Record<string, string>,
  isEdit: boolean,
): Promise<LessonResult> {
  const modelsToTry = [
    modelId ?? FALLBACK_MODEL_ID,
    ...(modelId !== FALLBACK_MODEL_ID ? [FALLBACK_MODEL_ID] : []),
  ];

  let lastError: Error | undefined;

  for (let i = 0; i < modelsToTry.length; i++) {
    const id = modelsToTry[i];
    if (i > 0) {
      writer.write({
        type: "data-status",
        data: { message: "Retrying with Gemini 2.5 Flash…" },
        transient: true,
      });
    }

    try {
      const model = getChatModel(id, credentials);
      const result = streamLessonFromMessages(
        model,
        modelMessages,
        isEdit ? existingFiles : undefined,
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

async function generateLessonWithFallback(
  writer: UIMessageStreamWriter<BuilderUIMessage>,
  modelId: string | undefined,
  credentials: AppCredentials | undefined,
  modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>,
  existingFiles: Record<string, string>,
): Promise<{
  site: LessonResult;
  changedPaths: Array<{ path: string; content: string }>;
  usedTools: boolean;
}> {
  const isEdit = Object.keys(existingFiles).length > 0;

  if (isEdit) {
    emitLog(writer, {
      stream: "system",
      text: "Edit mode: using readFile / writeFile tools",
      timestamp: Date.now(),
    });
    const toolResult = await runToolEditWithFallback(
      writer,
      modelId,
      credentials,
      modelMessages,
      existingFiles,
    );
    if (toolResult) {
      const changedPaths = toolResult.changedPaths.map((path) => ({
        path,
        content: toolResult.site.files.find((f) => f.path === path)!.content,
      }));
      return { site: toolResult.site, changedPaths, usedTools: true };
    }
    emitLog(writer, {
      stream: "system",
      text: "Tool edit produced no changes — falling back to structured edit",
      timestamp: Date.now(),
    });
  }

  const site = await generateStructuredWithFallback(
    writer,
    modelId,
    credentials,
    modelMessages,
    existingFiles,
    isEdit,
  );

  const changedPaths = isEdit
    ? site.files.filter((f) => existingFiles[f.path] !== f.content)
    : site.files;

  return { site, changedPaths, usedTools: false };
}

function contentLines(
  files: Array<{ path?: string; content?: string }>,
  path: string,
): number {
  const file = files.find((f) => f.path === path);
  if (!file?.content) return 0;
  return file.content.split("\n").length;
}

export async function POST(req: Request) {
  const body = await req.json();
  const messages: UIMessage[] = body.messages ?? [];
  const projectId: string | undefined = body.projectId;
  const modelId: string | undefined = body.modelId;
  const credentials: AppCredentials | undefined = body.credentials;
  const projectFiles: Record<string, string> | undefined = body.projectFiles;

  if (!projectId) {
    return new Response(JSON.stringify({ error: "projectId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resolved = resolveCredentials(credentials);
  if (!resolved.googleApiKey && !resolved.aiGatewayApiKey) {
    return new Response(
      JSON.stringify({
        error:
          "No API key found. Add your Gemini key in Settings or set GOOGLE_GENERATIVE_AI_API_KEY in Vercel env vars.",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    getChatModel(modelId, credentials);
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Invalid model config",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const sandboxAvailable = getProviderStatus(credentials).sandbox;

  try {
    const stream = createUIMessageStream<BuilderUIMessage>({
      originalMessages: messages as BuilderUIMessage[],
      execute: async ({ writer }) => {
        try {
          const hasExisting = Boolean(
            projectFiles && Object.keys(projectFiles).length > 0,
          );

          writer.write({
            type: "data-status",
            data: {
              message: hasExisting
                ? "Applying your edits…"
                : "Streaming lesson code…",
            },
            transient: true,
          });

          const existingFiles = await loadExistingFiles(
            projectId,
            projectFiles,
            credentials,
          );

          const modelMessages = await convertToModelMessages(messages);
          const { site, changedPaths, usedTools } =
            await generateLessonWithFallback(
              writer,
              modelId,
              credentials,
              modelMessages,
              existingFiles,
            );

          writer.write({
            type: "data-status",
            data: {
              message: hasExisting
                ? `Updated ${changedPaths.map((f) => f.path).join(", ") || "lesson"}…`
                : `Finalizing ${site.files.map((f) => f.path).join(", ")}…`,
            },
            transient: true,
          });

          let previewUrl: string | undefined;

          if (sandboxAvailable) {
            try {
              const { sandbox } = await getProjectSandbox(
                projectId,
                credentials,
              );
              const onLog = (line: LogLine) => emitLog(writer, line);
              await writeProjectFiles(sandbox, site.files, onLog);
              previewUrl = await ensurePreviewServer(sandbox, {
                force: true,
                onLog,
              });
              previewUrl = `${previewUrl}?v=${Date.now()}`;
            } catch (sandboxError) {
              console.error("Sandbox write failed:", sandboxError);
              emitLog(writer, {
                stream: "stderr",
                text:
                  sandboxError instanceof Error
                    ? sandboxError.message
                    : "Sandbox error",
                timestamp: Date.now(),
              });
              const emitList = hasExisting ? changedPaths : site.files;
              emitFiles(writer, emitList, undefined, false);
              emitAssistantText(
                writer,
                `${site.summary}\n\n(Preview unavailable: ${sandboxError instanceof Error ? sandboxError.message : "sandbox error"}. Code is shown in the Code tab.)`,
              );
              return;
            }
          }

          const emitList =
            hasExisting && usedTools ? changedPaths : hasExisting ? changedPaths : site.files;
          emitFiles(writer, emitList, previewUrl, false);
          emitAssistantText(writer, site.summary);
        } catch (error) {
          console.error("Build failed:", error);
          const message =
            error instanceof Error ? error.message : "Failed to generate lesson";
          emitAssistantText(
            writer,
            `Sorry, building failed: ${message}. Check your API key in Settings and try again.`,
          );
          writer.write({
            type: "data-status",
            data: { message: "Build failed" },
            transient: true,
          });
        }
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error("Chat failed:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Failed to process chat",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
