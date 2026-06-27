import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  UIMessage,
} from "ai";
import { getProjectSandbox } from "@/lib/sandbox";
import { getChatModel } from "@/lib/ai";
import type { AppCredentials } from "@/lib/credentials";
import { BUILDER_SYSTEM_PROMPT, createBuilderTools } from "@/lib/tools";
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

  try {
    const { sandbox, previewUrl } = await getProjectSandbox(
      projectId,
      credentials,
    );
    const tools = createBuilderTools(sandbox);

    const stream = createUIMessageStream<BuilderUIMessage>({
      originalMessages: messages as BuilderUIMessage[],
      execute: async ({ writer }) => {
        writer.write({
          type: "data-preview",
          data: { url: previewUrl, status: "ready" },
        });

        const result = streamText({
          model: getChatModel(modelId, credentials),
          system: BUILDER_SYSTEM_PROMPT,
          messages: await convertToModelMessages(messages),
          tools,
          stopWhen: isStepCount(10),
          onStepEnd: ({ toolResults }) => {
            for (const toolResult of toolResults) {
              if (
                toolResult.toolName === "writeFiles" &&
                toolResult.output &&
                typeof toolResult.output === "object" &&
                "previewUrl" in toolResult.output
              ) {
                writer.write({
                  type: "data-preview",
                  data: {
                    url: String(toolResult.output.previewUrl),
                    status: "ready",
                  },
                });
                if (
                  "written" in toolResult.output &&
                  Array.isArray(toolResult.output.written)
                ) {
                  writer.write({
                    type: "data-files",
                    data: { paths: toolResult.output.written as string[] },
                  });
                }
              }
            }
          },
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
