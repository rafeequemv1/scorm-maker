import { NextRequest, NextResponse } from "next/server";
import type { AppCredentials } from "@/lib/credentials";
import { getProviderStatus } from "@/lib/credentials";
import {
  getProjectSandbox,
  getSandboxSetupHint,
  listProjectFiles,
  readProjectFile,
} from "@/lib/sandbox";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const projectId: string | undefined = body.projectId;
  const credentials: AppCredentials | undefined = body.credentials;
  const path: string | undefined = body.path;

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  if (!getProviderStatus(credentials).sandbox) {
    return NextResponse.json(
      {
        error:
          getSandboxSetupHint(credentials) ?? "Sandbox not configured",
        files: [],
        contents: {},
      },
      { status: 503 },
    );
  }

  try {
    const { sandbox } = await getProjectSandbox(projectId, credentials);

    if (path) {
      const content = await readProjectFile(sandbox, path);
      return NextResponse.json({ path, content });
    }

    const files = await listProjectFiles(sandbox);
    const contents: Record<string, string> = {};

    await Promise.all(
      files.map(async (filePath) => {
        try {
          contents[filePath] = await readProjectFile(sandbox, filePath);
        } catch {
          // skip unreadable files
        }
      }),
    );

    return NextResponse.json({ files, contents });
  } catch (error) {
    console.error("Files fetch failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch files",
      },
      { status: 500 },
    );
  }
}
