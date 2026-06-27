import { NextRequest, NextResponse } from "next/server";
import type { AppCredentials } from "@/lib/credentials";
import { getProviderStatus } from "@/lib/credentials";
import {
  getProjectSandbox,
  getSandboxSetupHint,
  listProjectFiles,
} from "@/lib/sandbox";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const projectId: string | undefined = body.projectId;
  const credentials: AppCredentials | undefined = body.credentials;

  if (!projectId) {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 },
    );
  }

  if (!getProviderStatus(credentials).sandbox) {
    return NextResponse.json(
      {
        error:
          getSandboxSetupHint(credentials) ??
          "Sandbox not configured. Chat still works — add Vercel credentials in Settings for preview.",
        skipped: true,
      },
      { status: 503 },
    );
  }

  try {
    const { sandbox, previewUrl } = await getProjectSandbox(
      projectId,
      credentials,
    );
    const files = await listProjectFiles(sandbox);

    return NextResponse.json({ previewUrl, files });
  } catch (error) {
    console.error("Preview init failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to initialize sandbox",
      },
      { status: 500 },
    );
  }
}
