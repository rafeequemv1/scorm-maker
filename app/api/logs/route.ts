import { NextRequest, NextResponse } from "next/server";
import type { AppCredentials } from "@/lib/credentials";
import { getProviderStatus } from "@/lib/credentials";
import {
  getProjectSandbox,
  getSandboxSetupHint,
  readSandboxLogTail,
} from "@/lib/sandbox";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const projectId: string | undefined = body.projectId;
  const credentials: AppCredentials | undefined = body.credentials;
  const lines: number = body.lines ?? 80;

  if (!projectId) {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 },
    );
  }

  if (!getProviderStatus(credentials).sandbox) {
    return NextResponse.json(
      {
        error: getSandboxSetupHint(credentials) ?? "Sandbox not configured",
        logs: [],
      },
      { status: 503 },
    );
  }

  try {
    const { sandbox } = await getProjectSandbox(projectId, credentials);
    const logs = await readSandboxLogTail(sandbox, lines);
    return NextResponse.json({ logs });
  } catch (error) {
    console.error("Logs fetch failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch logs",
        logs: [],
      },
      { status: 500 },
    );
  }
}
