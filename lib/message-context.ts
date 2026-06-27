import { convertToModelMessages, type ModelMessage, type UIMessage } from "ai";
import { buildFileInventory } from "./lesson-edits";

/** User + assistant pairs kept in the model context. */
export const RECENT_TURN_COUNT = 4;

export type CompactMessageContext = {
  modelMessages: ModelMessage[];
  contextPrefix?: string;
  trimmed: boolean;
  droppedCount: number;
  recentCount: number;
};

function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Plain text from UI message parts (ignores tool UI parts). */
export function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n")
    .trim();
}

/**
 * Keep the last N user turns and everything after the Nth user message.
 * Earlier messages are summarized separately.
 */
export function sliceRecentMessages(
  messages: UIMessage[],
  maxTurns = RECENT_TURN_COUNT,
): { recent: UIMessage[]; dropped: UIMessage[] } {
  if (messages.length === 0) {
    return { recent: [], dropped: [] };
  }

  let userCount = 0;
  let startIdx = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      userCount++;
      if (userCount === maxTurns) {
        startIdx = i;
        break;
      }
    }
  }

  if (userCount < maxTurns) {
    return { recent: messages, dropped: [] };
  }

  return {
    recent: messages.slice(startIdx),
    dropped: messages.slice(0, startIdx),
  };
}

/** One-paragraph summary of the current lesson from files + original prompt. */
export function buildLessonSummary(
  files: Record<string, string>,
  allMessages: UIMessage[],
): string | null {
  if (Object.keys(files).length === 0) return null;

  const parts: string[] = [];
  const html = files["index.html"] ?? "";

  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  if (title) parts.push(`Title: "${title}"`);

  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim();
  if (h1 && h1 !== title) parts.push(`Main heading: "${h1}"`);

  parts.push(`Files (${Object.keys(files).length}): ${buildFileInventory(files).replace(/\n/g, ", ")}`);

  const firstUser = allMessages.find((m) => m.role === "user");
  const originalPrompt = firstUser ? getMessageText(firstUser) : "";
  if (originalPrompt) {
    parts.push(`Original request: ${truncate(originalPrompt, 220)}`);
  }

  return parts.join(". ");
}

/** Compress dropped chat turns into a short paragraph. */
export function buildConversationSummary(dropped: UIMessage[]): string {
  const snippets: string[] = [];

  for (const msg of dropped) {
    const text = getMessageText(msg);
    if (!text) continue;
    const label = msg.role === "user" ? "User" : "Assistant";
    snippets.push(`${label}: ${truncate(text, 160)}`);
  }

  return truncate(snippets.slice(-10).join(" → "), 1000);
}

export function buildContextPrefix(
  dropped: UIMessage[],
  files: Record<string, string> | undefined,
  allMessages: UIMessage[],
): string {
  const lessonSummary =
    files && Object.keys(files).length > 0
      ? buildLessonSummary(files, allMessages)
      : null;
  const conversationSummary = buildConversationSummary(dropped);

  return [
    "## Session context (older messages omitted to save tokens)",
    lessonSummary ? `Current lesson: ${lessonSummary}` : null,
    conversationSummary
      ? `Earlier conversation: ${conversationSummary}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function getLatestUserMessage(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      const text = getMessageText(messages[i]);
      if (text) return text;
    }
  }
  return "";
}

export function getRecentUserText(
  messages: UIMessage[],
  maxTurns = RECENT_TURN_COUNT,
): string {
  return messages
    .filter((m) => m.role === "user")
    .slice(-maxTurns)
    .map(getMessageText)
    .filter(Boolean)
    .join("\n");
}

export function appendContextToSystem(
  system: string,
  contextPrefix?: string,
): string {
  if (!contextPrefix?.trim()) return system;
  return `${system}\n\n${contextPrefix}`;
}

export async function buildCompactModelMessages(
  messages: UIMessage[],
  options?: {
    recentTurns?: number;
    files?: Record<string, string>;
  },
): Promise<CompactMessageContext> {
  const recentTurns = options?.recentTurns ?? RECENT_TURN_COUNT;
  const { recent, dropped } = sliceRecentMessages(messages, recentTurns);
  const modelMessages = await convertToModelMessages(recent);

  if (dropped.length === 0) {
    return {
      modelMessages,
      trimmed: false,
      droppedCount: 0,
      recentCount: recent.length,
    };
  }

  return {
    modelMessages,
    contextPrefix: buildContextPrefix(dropped, options?.files, messages),
    trimmed: true,
    droppedCount: dropped.length,
    recentCount: recent.length,
  };
}
