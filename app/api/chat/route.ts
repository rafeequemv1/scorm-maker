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
import { generateSiteFromMessages } from "@/lib/generate-site";
import {
  ensurePreviewServer,
  getProjectSandbox,
  listProjectFiles,
  readProjectFile,
  writeProjectFiles,
} from "@/lib/sandbox";
import type { BuilderUIMessage } from "@/lib/types";

export const maxDuration = 300;

async function loadExistingFilesContext(
  projectId: string,
  credentials?: AppCredentials,
): Promise<string> {
  try {
    const { sandbox } = await getProjectSandbox(projectId, credentials);
    const paths = await listProjectFiles(sandbox);
    const parts: string[] = [];
    for (const path of paths.slice(0, 6)) {
      try {
        const content = await readProjectFile(sandbox, path);
        parts.push(`--- ${path} ---\n${content.slice(0, 4000)}`);
      } catch {
        // skip
      }
    }
    return parts.join("\n\n");
  } catch {
    return "";
  }
}

function emitFiles(
  writer: UIMessageStreamWriter<BuilderUIMessage>,
  files: Array<{ path: string; content: string }>,
  previewUrl?: string,
) {
  for (const file of files) {
    writer.write({
      type: "data-fileContent",
      data: { path: file.path, content: file.content },
    });
  }
  writer.write({
    type: "data-files",
    data: { paths: files.map((f) => f.path) },
  });
  if (previewUrl) {
    writer.write({
      type: "data-preview",
      data: { url: previewUrl, status: "ready" },
    });
  }
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

  let model;
  try {
    model = getChatModel(modelId, credentials);
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
          writer.write({
            type: "data-status",
            data: { message: "Authoring interactive lesson..." },
            transient: true,
          });

          const existingContext = sandboxAvailable
            ? await loadExistingFilesContext(projectId, credentials)
            : "";

          if (sandboxAvailable) {
            writer.write({
              type: "data-status",
              data: { message: "Building quizzes, interactions, and activities..." },
              transient: true,
            });
          }

          const modelMessages = await convertToModelMessages(messages);
          const site = await generateSiteFromMessages(
            model,
            modelMessages,
            existingContext || undefined,
          );

          writer.write({
            type: "data-status",
            data: {
              message: `Writing ${site.files.map((f) => f.path).join(", ")}...`,
            },
            transient: true,
          });

          let previewUrl: string | undefined;

          if (sandboxAvailable) {
            try {
              const { sandbox } = await getProjectSandbox(projectId, credentials);
              await writeProjectFiles(sandbox, site.files);
              previewUrl = await ensurePreviewServer(sandbox, { force: true });
              previewUrl = `${previewUrl}?v=${Date.now()}`;
            } catch (sandboxError) {
              console.error("Sandbox write failed:", sandboxError);
              emitFiles(writer, site.files);
              emitAssistantText(
                writer,
                `${site.summary}\n\n(Preview unavailable: ${sandboxError instanceof Error ? sandboxError.message : "sandbox error"}. Code is shown in the Code tab.)`,
              );
              return;
            }
          }

          emitFiles(writer, site.files, previewUrl);
          emitAssistantText(writer, site.summary);
        } catch (error) {
          console.error("Build failed:", error);
          const message =
            error instanceof Error ? error.message : "Failed to generate site";
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
