import * as acorn from "acorn";
import { prepareScormPackageFiles } from "./scorm-packager";

export type ValidationIssue = {
  severity: "error" | "warning";
  code: string;
  path?: string;
  message: string;
  line?: number;
};

export type ValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
};

const MAX_FILES = 15;
const MIN_FILE_CONTENT = 20;

const PLACEHOLDER_PATTERNS = [
  /\bTODO\b/i,
  /\bFIXME\b/i,
  /lorem ipsum/i,
  /your code here/i,
  /\[placeholder\]/i,
  /coming soon/i,
  /replace with/i,
];

function issue(
  severity: ValidationIssue["severity"],
  code: string,
  message: string,
  path?: string,
  line?: number,
): ValidationIssue {
  return { severity, code, message, path, line };
}

function normalizePath(name: string): string {
  return name.replace(/^\.\//, "").split("/").pop() ?? name;
}

function fileExists(allFiles: Record<string, string>, ref: string): boolean {
  const normalized = ref.replace(/^\.\//, "").split("?")[0].split("#")[0];
  if (normalized.startsWith("http://") || normalized.startsWith("https://"))
    return true;
  if (Object.keys(allFiles).includes(normalized)) return true;
  const base = normalizePath(normalized);
  return Object.keys(allFiles).some(
    (p) => p === normalized || normalizePath(p) === base,
  );
}

function parseJsSyntax(
  path: string,
  content: string,
): ValidationIssue | null {
  try {
    acorn.parse(content, {
      ecmaVersion: "latest",
      sourceType: "module",
      allowAwaitOutsideFunction: true,
    });
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid JavaScript";
    const lineMatch = message.match(/\((\d+):\d+\)/);
    return issue(
      "error",
      "js_syntax",
      message,
      path,
      lineMatch ? Number(lineMatch[1]) : undefined,
    );
  }
}

function validateStructure(files: Record<string, string>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const paths = Object.keys(files);

  if (paths.length === 0) {
    issues.push(issue("error", "no_files", "Lesson has no files"));
    return issues;
  }

  if (paths.length > MAX_FILES) {
    issues.push(
      issue("error", "too_many_files", `Lesson has ${paths.length} files (max ${MAX_FILES})`),
    );
  }

  if (!paths.some((p) => p.toLowerCase() === "index.html")) {
    issues.push(issue("error", "missing_index", "index.html is required"));
  }

  for (const [path, content] of Object.entries(files)) {
    if (!content?.trim()) {
      issues.push(issue("error", "empty_file", "File is empty", path));
    } else if (content.trim().length < MIN_FILE_CONTENT && path.endsWith(".html")) {
      issues.push(
        issue("error", "content_too_short", "File content is too short to be a valid lesson file", path),
      );
    }
  }

  return issues;
}

function validatePlaceholders(files: Record<string, string>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const [path, content] of Object.entries(files)) {
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(content)) {
        issues.push(
          issue(
            "error",
            "placeholder",
            `Placeholder or incomplete content detected (${pattern.source})`,
            path,
          ),
        );
        break;
      }
    }
  }
  return issues;
}

function validateHtml(path: string, content: string, allFiles: Record<string, string>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lower = content.toLowerCase();

  if (!lower.includes("<html")) {
    issues.push(issue("error", "html_structure", "Missing <html> element", path));
  }
  if (!lower.includes("<body")) {
    issues.push(issue("error", "html_structure", "Missing <body> element", path));
  }

  const srcRefs = content.matchAll(/(?:src|href)=["']([^"']+)["']/gi);
  for (const match of srcRefs) {
    const ref = match[1];
    if (ref.startsWith("data:") || ref.startsWith("#")) continue;
    if (!fileExists(allFiles, ref)) {
      issues.push(
        issue(
          "error",
          "broken_reference",
          `Reference not found in lesson files: ${ref}`,
          path,
        ),
      );
    }
  }

  return issues;
}

function lessonUsesThreeJs(files: Record<string, string>): boolean {
  const combined = Object.entries(files)
    .map(([path, content]) => `${path}\n${content}`)
    .join("\n")
    .toLowerCase();
  return (
    Boolean(files["scene.js"]) ||
    combined.includes("esm.sh/three") ||
    combined.includes("from \"three\"") ||
    combined.includes("three.js")
  );
}

function validateThreeJs(files: Record<string, string>): ValidationIssue[] {
  if (!lessonUsesThreeJs(files)) return [];

  const issues: ValidationIssue[] = [];
  const combined = Object.values(files).join("\n");

  if (!combined.includes("requestAnimationFrame")) {
    issues.push(
      issue(
        "warning",
        "three_no_loop",
        "Three.js lesson should use requestAnimationFrame render loop",
        files["scene.js"] ? "scene.js" : undefined,
      ),
    );
  }

  const hasCanvas =
    combined.includes("<canvas") ||
    combined.includes("createElement(\"canvas\")") ||
    combined.includes("createElement('canvas')");
  const hasRenderer = combined.includes("WebGLRenderer") || combined.includes("renderer");

  if (!hasCanvas && !hasRenderer) {
    issues.push(
      issue(
        "error",
        "three_no_canvas",
        "Three.js lesson must include a canvas or WebGLRenderer setup",
        files["scene.js"] ? "scene.js" : "index.html",
      ),
    );
  }

  return issues;
}

function validateScormDryRun(files: Record<string, string>): ValidationIssue[] {
  try {
    prepareScormPackageFiles(files, "Validation Test");
    return [];
  } catch (err) {
    return [
      issue(
        "error",
        "scorm_packaging",
        err instanceof Error ? err.message : "SCORM packaging failed",
      ),
    ];
  }
}

function collectValidationIssues(
  files: Record<string, string>,
  options?: { skipScorm?: boolean },
): ValidationIssue[] {
  const issues: ValidationIssue[] = [
    ...validateStructure(files),
    ...validatePlaceholders(files),
  ];

  for (const [path, content] of Object.entries(files)) {
    if (path.toLowerCase().endsWith(".html")) {
      issues.push(...validateHtml(path, content, files));
    }
    if (path.endsWith(".js") || path.endsWith(".mjs")) {
      const syntaxIssue = parseJsSyntax(path, content);
      if (syntaxIssue) issues.push(syntaxIssue);
    }
  }

  issues.push(...validateThreeJs(files));

  if (!options?.skipScorm && issues.every((i) => i.severity !== "error")) {
    issues.push(...validateScormDryRun(files));
  }

  return issues;
}

export function validateLesson(
  files: Record<string, string>,
  options?: { skipScorm?: boolean },
): ValidationResult {
  const issues = collectValidationIssues(files, options);
  const ok = !issues.some((i) => i.severity === "error");
  return { ok, issues };
}

export function validateSingleFile(
  path: string,
  content: string,
  allFiles: Record<string, string>,
): ValidationIssue[] {
  const merged = { ...allFiles, [path]: content };
  const issues: ValidationIssue[] = [];

  if (!content?.trim()) {
    issues.push(issue("error", "empty_file", "File is empty", path));
    return issues;
  }

  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(content)) {
      issues.push(
        issue(
          "error",
          "placeholder",
          `Placeholder or incomplete content detected (${pattern.source})`,
          path,
        ),
      );
      break;
    }
  }

  if (path.toLowerCase().endsWith(".html")) {
    issues.push(...validateHtml(path, content, merged));
  }

  if (path.endsWith(".js") || path.endsWith(".mjs")) {
    const syntaxIssue = parseJsSyntax(path, content);
    if (syntaxIssue) issues.push(syntaxIssue);
  }

  if (path === "scene.js" || content.includes("esm.sh/three")) {
    issues.push(...validateThreeJs(merged));
  }

  return issues;
}

export function lessonResultToRecord(
  files: Array<{ path: string; content: string }>,
): Record<string, string> {
  const record: Record<string, string> = {};
  for (const file of files) {
    if (file.path?.trim()) record[file.path] = file.content;
  }
  return record;
}

export function formatValidationReport(issues: ValidationIssue[]): string {
  return issues
    .filter((i) => i.severity === "error")
    .map((i) => {
      const loc = i.line ? `${i.path}:${i.line}` : i.path;
      return loc ? `- ${loc} — ${i.message}` : `- ${i.message}`;
    })
    .join("\n");
}
