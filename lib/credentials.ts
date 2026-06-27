export type AppCredentials = {
  googleApiKey?: string;
  aiGatewayApiKey?: string;
  vercelToken?: string;
  vercelTeamId?: string;
  vercelProjectId?: string;
};

export type ResolvedCredentials = {
  googleApiKey?: string;
  aiGatewayApiKey?: string;
  vercelToken?: string;
  vercelTeamId?: string;
  vercelProjectId?: string;
};

export const CREDENTIALS_STORAGE_KEY = "siteforge-credentials";

export function resolveCredentials(
  input?: AppCredentials,
): ResolvedCredentials {
  return {
    googleApiKey:
      input?.googleApiKey?.trim() ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY,
    aiGatewayApiKey:
      input?.aiGatewayApiKey?.trim() || process.env.AI_GATEWAY_API_KEY,
    vercelToken: input?.vercelToken?.trim() || process.env.VERCEL_TOKEN,
    vercelTeamId: input?.vercelTeamId?.trim() || process.env.VERCEL_TEAM_ID,
    vercelProjectId:
      input?.vercelProjectId?.trim() || process.env.VERCEL_PROJECT_ID,
  };
}

export function getProviderStatus(credentials?: AppCredentials) {
  const resolved = resolveCredentials(credentials);
  const onVercel = Boolean(process.env.VERCEL);

  return {
    google: Boolean(resolved.googleApiKey),
    gateway: Boolean(resolved.aiGatewayApiKey),
    sandboxExplicit: Boolean(
      resolved.vercelToken &&
        resolved.vercelTeamId &&
        resolved.vercelProjectId,
    ),
    sandboxOidc: onVercel,
    sandbox:
      onVercel ||
      Boolean(
        resolved.vercelToken &&
          resolved.vercelTeamId &&
          resolved.vercelProjectId,
      ),
    onVercel,
  };
}

export function getSandboxCredentials(credentials?: AppCredentials) {
  const resolved = resolveCredentials(credentials);

  if (
    resolved.vercelToken &&
    resolved.vercelTeamId &&
    resolved.vercelProjectId
  ) {
    return {
      token: resolved.vercelToken,
      teamId: resolved.vercelTeamId,
      projectId: resolved.vercelProjectId,
    };
  }

  return {};
}

export function loadStoredCredentials(): AppCredentials {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CREDENTIALS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as AppCredentials;
  } catch {
    return {};
  }
}

export function saveStoredCredentials(credentials: AppCredentials) {
  localStorage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify(credentials));
}

export function clearStoredCredentials() {
  localStorage.removeItem(CREDENTIALS_STORAGE_KEY);
}

export function maskSecret(value?: string) {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
