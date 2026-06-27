import type { BuilderUIMessage } from "./types";

export type StoredProject = {
  id: string;
  title: string;
  updatedAt: number;
  messages: BuilderUIMessage[];
  files: Record<string, string>;
};

const CURRENT_PROJECT_KEY = "scormforge-current-project-id";
const PROJECTS_INDEX_KEY = "scormforge-projects-index";
const projectKey = (id: string) => `scormforge-project-${id}`;

const MAX_PROJECTS = 30;
const MAX_MESSAGES = 80;

function readIndex(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PROJECTS_INDEX_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(ids: string[]) {
  localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(ids.slice(0, MAX_PROJECTS)));
}

export function getCurrentProjectId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(CURRENT_PROJECT_KEY) ?? "";
}

export function setCurrentProjectId(id: string) {
  localStorage.setItem(CURRENT_PROJECT_KEY, id);
}

export function loadProject(id: string): StoredProject | null {
  if (typeof window === "undefined" || !id) return null;
  try {
    const raw = localStorage.getItem(projectKey(id));
    if (!raw) return null;
    return JSON.parse(raw) as StoredProject;
  } catch {
    return null;
  }
}

export function saveProject(project: StoredProject) {
  if (typeof window === "undefined") return;
  const trimmed: StoredProject = {
    ...project,
    messages: project.messages.slice(-MAX_MESSAGES),
    updatedAt: Date.now(),
  };
  localStorage.setItem(projectKey(trimmed.id), JSON.stringify(trimmed));
  const index = readIndex().filter((id) => id !== trimmed.id);
  index.unshift(trimmed.id);
  writeIndex(index);
  setCurrentProjectId(trimmed.id);
}

export function listProjects(): StoredProject[] {
  return readIndex()
    .map((id) => loadProject(id))
    .filter((p): p is StoredProject => Boolean(p))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteProject(id: string) {
  localStorage.removeItem(projectKey(id));
  writeIndex(readIndex().filter((pid) => pid !== id));
}

export function createEmptyProject(id?: string): StoredProject {
  const newId = id ?? crypto.randomUUID();
  return {
    id: newId,
    title: "Untitled lesson",
    updatedAt: Date.now(),
    messages: [],
    files: {},
  };
}

export function deriveProjectTitle(
  messages: BuilderUIMessage[],
  files: Record<string, string>,
): string {
  const firstUser = messages.find((m) => m.role === "user");
  const textPart = firstUser?.parts.find((p) => p.type === "text");
  if (textPart && textPart.type === "text" && textPart.text.trim()) {
    return textPart.text.trim().slice(0, 60);
  }
  if (files["index.html"]) {
    const match = files["index.html"].match(/<title>([^<]+)<\/title>/i);
    if (match?.[1]) return match[1].slice(0, 60);
  }
  return "Untitled lesson";
}

export function buildFilesContext(files: Record<string, string>): string {
  const entries = Object.entries(files).filter(([, content]) => content?.trim());
  if (entries.length === 0) return "";

  const sorted = entries.sort(([a], [b]) => a.localeCompare(b));
  let total = 0;
  const maxTotal = 120_000;
  const parts: string[] = [];

  for (const [path, content] of sorted) {
    const slice = content.slice(0, 12_000);
    const block = `--- ${path} ---\n${slice}`;
    if (total + block.length > maxTotal) {
      parts.push(`--- ${path} ---\n[truncated — ${content.length} chars total]`);
      continue;
    }
    parts.push(block);
    total += block.length;
  }

  return parts.join("\n\n");
}

export function exportProjectJson(project: StoredProject): string {
  return JSON.stringify(project, null, 2);
}

export function importProjectJson(json: string): StoredProject {
  const parsed = JSON.parse(json) as StoredProject;
  if (!parsed.id || !parsed.files || !Array.isArray(parsed.messages)) {
    throw new Error("Invalid project file");
  }
  const id = crypto.randomUUID();
  return {
    ...parsed,
    id,
    updatedAt: Date.now(),
    title: parsed.title || deriveProjectTitle(parsed.messages, parsed.files),
  };
}
