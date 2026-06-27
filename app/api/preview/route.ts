import { NextRequest, NextResponse } from "next/server";
import type { AppCredentials } from "@/lib/credentials";
import { getProviderStatus } from "@/lib/credentials";
import type { LogLine } from "@/lib/sandbox-logs";
import { createLogLine } from "@/lib/sandbox-logs";
import {
  ensurePreviewServer,
  getProjectSandbox,
  getSandboxSetupHint,
  listProjectFiles,
  readSandboxLogTail,
  writeProjectFiles,
} from "@/lib/sandbox";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const projectId: string | undefined = body.projectId;
  const credentials: AppCredentials | undefined = body.credentials;
  const files: Record<string, string> | undefined = body.files;

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

  const collected: LogLine[] = [];
  const onLog = (line: LogLine) => collected.push(line);

  try {
    const { sandbox } = await getProjectSandbox(projectId, credentials);

    if (files && Object.keys(files).length > 0) {
      const entries = Object.entries(files).map(([path, content]) => ({
        path,
        content,
      }));
      await writeProjectFiles(sandbox, entries, onLog);
    }

    const previewUrl = await ensurePreviewServer(sandbox, {
      force: Boolean(files && Object.keys(files).length > 0),
      onLog,
    });

    const filesList = await listProjectFiles(sandbox);
    const serveLogs = await readSandboxLogTail(sandbox, 40);

    return NextResponse.json({
      previewUrl: `${previewUrl}?v=${Date.now()}`,
      files: filesList,
      logs: [...collected, ...serveLogs],
    });
  } catch (error) {
    console.error("Preview init failed:", error);
    collected.push(
      createLogLine(
        "stderr",
        error instanceof Error ? error.message : "Preview init failed",
      ),
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to initialize sandbox",
        logs: collected,
      },
      { status: 500 },
    );
  }
}
