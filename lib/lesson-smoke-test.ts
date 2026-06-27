import type { Sandbox } from "@vercel/sandbox";
import type { ValidationIssue } from "./lesson-validator";
import {
  ensurePreviewServer,
  writeProjectFiles,
  type SandboxLogCallback,
} from "./sandbox";
import { PREVIEW_PORT } from "./types";

export type SmokeTestResult = {
  ok: boolean;
  skipped: boolean;
  issues: ValidationIssue[];
  previewUrl?: string;
};

function smokeIssue(
  code: string,
  message: string,
  path?: string,
): ValidationIssue {
  return { severity: "error", code, message, path };
}

function lessonUsesThreeJs(files: Record<string, string>): boolean {
  const combined = Object.values(files).join("\n").toLowerCase();
  return (
    Boolean(files["scene.js"]) ||
    combined.includes("esm.sh/three") ||
    combined.includes("three.js")
  );
}

export async function runLessonSmokeTest(
  sandbox: Sandbox,
  files: Record<string, string>,
  onLog?: SandboxLogCallback,
): Promise<SmokeTestResult> {
  const issues: ValidationIssue[] = [];

  try {
    await writeProjectFiles(
      sandbox,
      Object.entries(files).map(([path, content]) => ({ path, content })),
      onLog,
    );

    const previewUrl = await ensurePreviewServer(sandbox, {
      force: true,
      onLog,
    });

    const curl = await sandbox.runCommand("curl", [
      "-sf",
      `http://127.0.0.1:${PREVIEW_PORT}/`,
      "-o",
      "/tmp/scormforge-smoke.html",
    ]);

    if (curl.exitCode !== 0) {
      issues.push(
        smokeIssue("smoke_curl_failed", "Preview URL did not return HTML"),
      );
      return { ok: false, skipped: false, issues, previewUrl };
    }

    const read = await sandbox.runCommand("cat", ["/tmp/scormforge-smoke.html"]);
    const html = await read.stdout();

    if (!html.toLowerCase().includes("<html") || html.length < 100) {
      issues.push(
        smokeIssue("smoke_empty_html", "Preview returned empty or invalid HTML"),
      );
    }

    if (/SyntaxError|ReferenceError|TypeError/i.test(html)) {
      issues.push(
        smokeIssue(
          "smoke_runtime_error",
          "Preview HTML contains JavaScript error text",
        ),
      );
    }

    if (lessonUsesThreeJs(files)) {
      const scenePath = files["scene.js"] ? "scene.js" : null;
      if (scenePath) {
        const sceneCurl = await sandbox.runCommand("curl", [
          "-sf",
          `http://127.0.0.1:${PREVIEW_PORT}/${scenePath}`,
        ]);
        if (sceneCurl.exitCode !== 0) {
          issues.push(
            smokeIssue(
              "smoke_scene_missing",
              `scene.js not served at /${scenePath}`,
              scenePath,
            ),
          );
        } else {
          const sceneBody = await sceneCurl.stdout();
          if (sceneBody.length < 50) {
            issues.push(
              smokeIssue(
                "smoke_scene_empty",
                "scene.js served but appears empty",
                scenePath,
              ),
            );
          }
        }
      }
    }

    return {
      ok: issues.length === 0,
      skipped: false,
      issues,
      previewUrl: `${previewUrl}?v=${Date.now()}`,
    };
  } catch (err) {
    issues.push(
      smokeIssue(
        "smoke_exception",
        err instanceof Error ? err.message : "Smoke test failed",
      ),
    );
    return { ok: false, skipped: false, issues };
  }
}

export function skippedSmokeTest(reason: string): SmokeTestResult {
  return {
    ok: true,
    skipped: true,
    issues: [
      {
        severity: "warning",
        code: "smoke_skipped",
        message: reason,
      },
    ],
  };
}
