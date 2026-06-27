import { Sandbox } from "@vercel/sandbox";
import type { AppCredentials } from "./credentials";
import { getProviderStatus, getSandboxCredentials } from "./credentials";
import type { LogLine } from "./sandbox-logs";
import { createLogLine } from "./sandbox-logs";
import {
  DEFAULT_INDEX_HTML,
  DEFAULT_SCRIPT_JS,
  DEFAULT_STYLES_CSS,
  PREVIEW_PORT,
  SANDBOX_WORKDIR,
} from "./types";

export const SANDBOX_LOG_PATH = "/tmp/scormforge-serve.log";

const SERVE_CONFIG = JSON.stringify(
  {
    public: true,
    headers: [
      {
        source: "**/*.@(js|mjs)",
        headers: [
          {
            key: "Content-Type",
            value: "text/javascript; charset=utf-8",
          },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
      {
        source: "**/*.css",
        headers: [
          {
            key: "Content-Type",
            value: "text/css; charset=utf-8",
          },
        ],
      },
    ],
  },
  null,
  2,
);

export type SandboxLogCallback = (line: LogLine) => void;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function killPreviewServer(
  sandbox: Sandbox,
  onLog?: SandboxLogCallback,
): Promise<void> {
  try {
    const result = await sandbox.runCommand("sh", [
      "-c",
      `pkill -f "serve.*${PREVIEW_PORT}" 2>/dev/null || true`,
    ]);
    await captureCommandOutput(result, onLog);
  } catch {
    // ignore
  }
}

async function isPreviewServingHtml(
  sandbox: Sandbox,
  onLog?: SandboxLogCallback,
): Promise<boolean> {
  try {
    const result = await sandbox.runCommand("curl", [
      "-sf",
      `http://127.0.0.1:${PREVIEW_PORT}/`,
      "-o",
      "/tmp/siteforge-preview.html",
    ]);
    if (result.exitCode !== 0) return false;
    const read = await sandbox.runCommand("cat", ["/tmp/siteforge-preview.html"]);
    if (read.exitCode !== 0) return false;
    const body = (await read.stdout()).toLowerCase();
    const ok = body.includes("<html") && body.length > 100;
    if (!ok) {
      onLog?.(createLogLine("stderr", "Preview health check: empty or invalid HTML"));
    }
    return ok;
  } catch {
    return false;
  }
}

async function waitForPreviewReady(
  sandbox: Sandbox,
  onLog?: SandboxLogCallback,
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (await isPreviewServingHtml(sandbox, onLog)) return;
    onLog?.(
      createLogLine("system", `Waiting for preview… (${attempt + 1}/20)`),
    );
    await sleep(1000);
  }
  throw new Error("Preview server did not start in time");
}

async function writeServeConfig(sandbox: Sandbox): Promise<void> {
  await sandbox.writeFiles([
    {
      path: "/tmp/scormforge-serve.json",
      content: Buffer.from(SERVE_CONFIG),
    },
  ]);
}

export async function readSandboxLogTail(
  sandbox: Sandbox,
  lines = 80,
): Promise<LogLine[]> {
  const result = await sandbox.runCommand("sh", [
    "-c",
    `tail -n ${lines} ${SANDBOX_LOG_PATH} 2>/dev/null || echo "(no serve logs yet)"`,
  ]);
  const stdout = await result.stdout();
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((text) => createLogLine("stdout", text));
}

async function captureCommandOutput(
  result: { stdout: () => Promise<string>; stderr: () => Promise<string> },
  onLog?: SandboxLogCallback,
): Promise<void> {
  if (!onLog) return;
  try {
    const stdout = await result.stdout();
    if (stdout.trim()) {
      for (const line of stdout.trim().split("\n")) {
        onLog(createLogLine("stdout", line));
      }
    }
    const stderr = await result.stderr();
    if (stderr.trim()) {
      for (const line of stderr.trim().split("\n")) {
        onLog(createLogLine("stderr", line));
      }
    }
  } catch {
    // ignore log capture failures
  }
}

export async function ensurePreviewServer(
  sandbox: Sandbox,
  options?: { force?: boolean; onLog?: SandboxLogCallback },
): Promise<string> {
  const onLog = options?.onLog;
  onLog?.(createLogLine("system", "Checking preview server…"));

  if (!options?.force && (await isPreviewServingHtml(sandbox, onLog))) {
    onLog?.(createLogLine("system", `Preview already running on port ${PREVIEW_PORT}`));
    return sandbox.domain(PREVIEW_PORT);
  }

  await killPreviewServer(sandbox, onLog);

  onLog?.(
    createLogLine(
      "system",
      `Starting serve on port ${PREVIEW_PORT} (ES module friendly)…`,
    ),
  );

  await sandbox.runCommand({
    cmd: "sh",
    args: [
      "-c",
      `npx -y serve -l ${PREVIEW_PORT} -n --config /tmp/scormforge-serve.json ${SANDBOX_WORKDIR} >> ${SANDBOX_LOG_PATH} 2>&1`,
    ],
    detached: true,
    cwd: SANDBOX_WORKDIR,
  });

  await waitForPreviewReady(sandbox, onLog);
  onLog?.(createLogLine("system", "Preview server ready"));
  return sandbox.domain(PREVIEW_PORT);
}

export function getSandboxSetupHint(credentials?: AppCredentials): string | null {
  const status = getProviderStatus(credentials);

  if (status.sandbox) return null;

  if (status.onVercel) {
    return "Sandbox auth failed. Ensure this Vercel project has Sandbox enabled on your team plan.";
  }

  return "For local preview, open Settings and add Vercel Token, Team ID, and Project ID — or run `vercel link && vercel env pull`.";
}

export async function getProjectSandbox(
  projectId: string,
  credentials?: AppCredentials,
): Promise<{ sandbox: Sandbox; previewUrl: string }> {
  const status = getProviderStatus(credentials);
  if (!status.sandbox) {
    throw new Error(getSandboxSetupHint(credentials) ?? "Sandbox not configured");
  }

  const sandboxCreds = getSandboxCredentials(credentials);
  const sandboxName = `siteforge-${projectId.slice(0, 32)}`;

  const sandbox = await Sandbox.getOrCreate({
    ...sandboxCreds,
    name: sandboxName,
    ports: [PREVIEW_PORT],
    runtime: "node24",
    timeout: 600_000,
    onCreate: async (sbx) => {
      await writeServeConfig(sbx);
      await sbx.writeFiles([
        {
          path: `${SANDBOX_WORKDIR}/index.html`,
          content: Buffer.from(DEFAULT_INDEX_HTML),
        },
        {
          path: `${SANDBOX_WORKDIR}/styles.css`,
          content: Buffer.from(DEFAULT_STYLES_CSS),
        },
        {
          path: `${SANDBOX_WORKDIR}/script.js`,
          content: Buffer.from(DEFAULT_SCRIPT_JS),
        },
      ]);
    },
  });

  await writeServeConfig(sandbox);
  const previewUrl = await ensurePreviewServer(sandbox);
  return { sandbox, previewUrl };
}

export async function listProjectFiles(sandbox: Sandbox): Promise<string[]> {
  const result = await sandbox.runCommand("find", [
    SANDBOX_WORKDIR,
    "-type",
    "f",
    "-not",
    "-path",
    "*/node_modules/*",
  ]);
  const stdout = await result.stdout();
  return stdout
    .split("\n")
    .map((line) => line.trim().replace(`${SANDBOX_WORKDIR}/`, ""))
    .filter(Boolean);
}

export async function readProjectFile(
  sandbox: Sandbox,
  path: string,
): Promise<string> {
  const safePath = path.replace(/^\/+/, "").replace(/\.\./g, "");
  const result = await sandbox.runCommand("cat", [
    `${SANDBOX_WORKDIR}/${safePath}`,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`File not found: ${safePath}`);
  }
  return await result.stdout();
}

export async function writeProjectFiles(
  sandbox: Sandbox,
  files: Array<{ path: string; content: string }>,
  onLog?: SandboxLogCallback,
): Promise<string[]> {
  const written: string[] = [];
  await writeServeConfig(sandbox);
  await sandbox.writeFiles(
    files.map((file) => {
      const safePath = file.path.replace(/^\/+/, "").replace(/\.\./g, "");
      written.push(safePath);
      return {
        path: `${SANDBOX_WORKDIR}/${safePath}`,
        content: Buffer.from(file.content),
      };
    }),
  );
  onLog?.(
    createLogLine("system", `Synced ${written.join(", ")} to sandbox`),
  );
  return written;
}
