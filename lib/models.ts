export type ModelProvider = "google" | "gateway";

export type ModelOption = {
  id: string;
  label: string;
  provider: ModelProvider;
  description: string;
};

export const CHAT_MODELS: ModelOption[] = [
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "google",
    description: "Fast, great for building sites",
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "google",
    description: "Smarter, slower",
  },
  {
    id: "gemini-3-flash-preview",
    label: "Gemini 3 Flash",
    provider: "google",
    description: "Latest preview model",
  },
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash (Gateway)",
    provider: "gateway",
    description: "Via Vercel AI Gateway",
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    label: "Claude Sonnet 4.5",
    provider: "gateway",
    description: "Via Vercel AI Gateway",
  },
];

export const DEFAULT_MODEL_ID = "gemini-2.5-flash";

export function getModelOption(modelId: string): ModelOption {
  return (
    CHAT_MODELS.find((m) => m.id === modelId) ??
    CHAT_MODELS.find((m) => m.id === DEFAULT_MODEL_ID)!
  );
}
