import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  UIMessage,
} from "ai";
import { getChatModel } from "@/lib/ai";
import type { AppCredentials } from "@/lib/credentials";
import { getProviderStatus, resolveCredentials } from "@/lib/credentials";
import { getProjectSandbox } from "@/lib/sandbox";
import {
  BUILDER_SYSTEM_PROMPT,
  createBuilderTools,
  type SandboxContext,
} from "@/lib/tools";
import type { BuilderUIMessage } from "@/lib/types";

export const maxDuration = 300;

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
  let sandboxPromise: Promise<SandboxContext> | null = null;

  const getSandbox = () => {
    if (!sandboxPromise) {
      sandboxPromise = getProjectSandbox(projectId, credentials);
    }
    return sandboxPromise;
  };

  try {
    const stream = createUIMessageStream<BuilderUIMessage>({
      originalMessages: messages as BuilderUIMessage[],
      execute: async ({ writer }) => {
        writer.write({
          type: "data-status",
          data: { message: "Thinking..." },
          transient: true,
        });

        const tools = createBuilderTools(getSandbox, credentials, (event) => {
          if (event.type === "status") {
            writer.write({
              type: "data-status",
              data: { message: event.message },
              transient: true,
            });
          }
          if (event.type === "files-written") {
            for (const file of event.files) {
              writer.write({
                type: "data-fileContent",
                data: { path: file.path, content: file.content },
              });
            }
            writer.write({
              type: "data-files",
              data: { paths: event.written },
            });
            writer.write({
              type: "data-preview",
              data: { url: event.previewUrl, status: "ready" },
            });
          }
        });

        if (sandboxAvailable) {
          getSandbox()
            .then(({ previewUrl }) => {
              writer.write({
                type: "data-preview",
                data: { url: previewUrl, status: "ready" },
              });
            })
            .catch((err) => {
              console.error("Sandbox preview failed:", err);
            });
        }

        const result = streamText({
          model,
          system: BUILDER_SYSTEM_PROMPT,
          messages: await convertToModelMessages(messages),
          tools,
          stopWhen: isStepCount(10),
        });

        writer.merge(
          toUIMessageStream({
            stream: result.stream,
            originalMessages: messages as BuilderUIMessage[],
          }),
        );
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
