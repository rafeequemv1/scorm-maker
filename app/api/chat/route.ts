import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  UIMessage,
  type UIMessageStreamWriter,
} from "ai";
import { getChatModel } from "@/lib/ai";
import type { AppCredentials } from "@/lib/credentials";
import { getProviderStatus, resolveCredentials } from "@/lib/credentials";
import { runLessonPipeline } from "@/lib/lesson-pipeline";
import {
  getProjectSandbox,
  listProjectFiles,
  readProjectFile,
} from "@/lib/sandbox";
import type { BuilderUIMessage } from "@/lib/types";
import { buildAuthoringSystemPrompt } from "@/lib/authoring-prompt";
import type { LogLine } from "@/lib/sandbox-logs";
import {
  buildCompactModelMessages,
  getLatestUserMessage,
  getRecentUserText,
} from "@/lib/message-context";

export const maxDuration = 300;

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

          const compact = await buildCompactModelMessages(messages, {
            files: existingFiles,
          });

          const userMessage = getLatestUserMessage(messages);
          const recentUserText = getRecentUserText(messages);
          const promptContext = {
            userMessage,
            recentUserText,
            existingFiles,
            mode: hasExisting ? ("edit" as const) : ("create" as const),
            conversationContext: compact.contextPrefix,
          };

          const { injectionLabel } = buildAuthoringSystemPrompt({
            userMessage,
            recentUserText,
            existingFiles,
            mode: promptContext.mode,
          });

          emitLog(writer, {
            stream: "system",
            text: `Library context: ${injectionLabel}`,
            timestamp: Date.now(),
          });

          if (compact.trimmed) {
            emitLog(writer, {
              stream: "system",
              text: `Context trimmed: using last ${compact.recentCount} messages (${compact.droppedCount} older summarized)`,
              timestamp: Date.now(),
            });
          }

          const {
            site,
            changedPaths,
            usedTools,
            previewUrl,
            validationFailed,
          } = await runLessonPipeline({
            writer,
            modelId,
            credentials,
            modelMessages: compact.modelMessages,
            existingFiles,
            promptContext,
            sandboxAvailable,
            projectId,
            maxRepairAttempts: 2,
          });

          writer.write({
            type: "data-status",
            data: {
              message: hasExisting
                ? `Updated ${changedPaths.map((f) => f.path).join(", ") || "lesson"}…`
                : `Finalizing ${site.files.map((f) => f.path).join(", ")}…`,
            },
            transient: true,
          });

          const emitList =
            hasExisting && usedTools
              ? changedPaths
              : hasExisting
                ? changedPaths
                : site.files;

          if (!previewUrl && sandboxAvailable && validationFailed) {
            emitFiles(writer, emitList, undefined, false);
            emitAssistantText(
              writer,
              `${site.summary}\n\n(Preview unavailable — validation issues remain. Check the Logs tab.)`,
            );
            return;
          }

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
