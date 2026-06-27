import { NextRequest, NextResponse } from "next/server";
import type { AppCredentials } from "@/lib/credentials";
import { getProviderStatus } from "@/lib/credentials";
import { getConfiguredProviders } from "@/lib/ai";
import { CHAT_MODELS, DEFAULT_MODEL_ID } from "@/lib/models";

function buildModelsResponse(credentials?: AppCredentials) {
  const providers = getConfiguredProviders(credentials);
  const status = getProviderStatus(credentials);

  const models = CHAT_MODELS.filter((model) => {
    if (model.provider === "google") return providers.google;
    return providers.gateway;
  });

  let setupHint: string | null = null;
  if (!providers.google && !providers.gateway) {
    setupHint =
      "Add a Gemini API key in Settings (or .env.local) to start building.";
  }

  return {
    models,
    defaultModelId: models.some((m) => m.id === DEFAULT_MODEL_ID)
      ? DEFAULT_MODEL_ID
      : (models[0]?.id ?? null),
    providers,
    sandbox: status,
    setupHint,
  };
}

export async function GET() {
  return NextResponse.json(buildModelsResponse());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const credentials: AppCredentials | undefined = body.credentials;
  return NextResponse.json(buildModelsResponse(credentials));
}
