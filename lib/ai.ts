import { createGateway } from "ai";
import { createGoogle } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import type { AppCredentials } from "./credentials";
import { resolveCredentials } from "./credentials";
import { DEFAULT_MODEL_ID, getModelOption } from "./models";

export function getChatModel(
  modelId?: string,
  credentials?: AppCredentials,
): LanguageModel {
  const option = getModelOption(modelId ?? DEFAULT_MODEL_ID);
  const resolved = resolveCredentials(credentials);

  if (option.provider === "google") {
    if (!resolved.googleApiKey) {
      throw new Error(
        "Gemini API key required. Open Settings and paste your key from https://aistudio.google.com/apikey",
      );
    }
    const google = createGoogle({ apiKey: resolved.googleApiKey });
    return google(option.id);
  }

  if (!resolved.aiGatewayApiKey) {
    throw new Error(
      "AI Gateway API key required for this model. Open Settings or switch to a Gemini model.",
    );
  }

  const gateway = createGateway({ apiKey: resolved.aiGatewayApiKey });
  return gateway(option.id);
}

export function getConfiguredProviders(credentials?: AppCredentials) {
  const resolved = resolveCredentials(credentials);
  return {
    google: Boolean(resolved.googleApiKey),
    gateway: Boolean(resolved.aiGatewayApiKey),
  };
}
