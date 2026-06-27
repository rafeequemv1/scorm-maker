import { Sandbox } from "@vercel/sandbox";
import type { AppCredentials } from "./credentials";
import { getProviderStatus, getSandboxCredentials } from "./credentials";
import {
  DEFAULT_INDEX_HTML,
  DEFAULT_SCRIPT_JS,
  DEFAULT_STYLES_CSS,
  PREVIEW_PORT,
  SANDBOX_WORKDIR,
} from "./types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function killPreviewServer(sandbox: Sandbox): Promise<void> {
  try {
    await sandbox.runCommand("sh", [
      "-c",
      `pkill -f "serve.*${PREVIEW_PORT}" 2>/dev/null || true`,
    ]);
  } catch {
    // ignore
  }
}

async function isPreviewServingHtml(sandbox: Sandbox): Promise<boolean> {
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
    return body.includes("<html") && body.length > 100;
  } catch {
    return false;
  }
}

async function waitForPreviewReady(sandbox: Sandbox): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (await isPreviewServingHtml(sandbox)) return;
    await sleep(1000);
  }
  throw new Error("Preview server did not start in time");
}

export async function ensurePreviewServer(
  sandbox: Sandbox,
  options?: { force?: boolean },
): Promise<string> {
  if (!options?.force && (await isPreviewServingHtml(sandbox))) {
    return sandbox.domain(PREVIEW_PORT);
  }

  await killPreviewServer(sandbox);

  await sandbox.runCommand({
    cmd: "npx",
    args: ["-y", "serve", "-l", String(PREVIEW_PORT), SANDBOX_WORKDIR],
    detached: true,
    cwd: SANDBOX_WORKDIR,
  });

  await waitForPreviewReady(sandbox);
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
): Promise<string[]> {
  const written: string[] = [];
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
  return written;
}
