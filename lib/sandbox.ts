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

async function isServerRunning(sandbox: Sandbox): Promise<boolean> {
  try {
    const result = await sandbox.runCommand("curl", [
      "-sf",
      `http://localhost:${PREVIEW_PORT}`,
      "-o",
      "/dev/null",
    ]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function ensurePreviewServer(
  sandbox: Sandbox,
): Promise<string> {
  const running = await isServerRunning(sandbox);
  if (!running) {
    await sandbox.runCommand({
      cmd: "npx",
      args: ["-y", "serve", "-l", String(PREVIEW_PORT), SANDBOX_WORKDIR],
      detached: true,
      cwd: SANDBOX_WORKDIR,
    });
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
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
