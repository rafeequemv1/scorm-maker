export type LessonEditResult = {
  changedFiles: Array<{ path: string; content: string }>;
  deletedPaths?: string[];
  summary?: string;
  librariesUsed?: string[];
};

export type LessonResult = {
  files: Array<{ path: string; content: string }>;
  summary: string;
  librariesUsed?: string[];
};

/** Merge surgical edits into the existing lesson file map. */
export function mergeLessonEdits(
  existing: Record<string, string>,
  edit: LessonEditResult,
): Record<string, string> {
  const merged = { ...existing };

  for (const file of edit.changedFiles) {
    if (!file.path?.trim()) continue;
    merged[file.path] = file.content;
  }

  for (const path of edit.deletedPaths ?? []) {
    delete merged[path];
  }

  return merged;
}

export function mergedToLessonOutput(
  merged: Record<string, string>,
  summary: string,
  librariesUsed?: string[],
): LessonResult {
  return {
    files: Object.entries(merged)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, content]) => ({ path, content })),
    summary,
    librariesUsed,
  };
}

export function buildFileInventory(files: Record<string, string>): string {
  return Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, content]) => {
      const lines = content ? content.split("\n").length : 0;
      return `- ${path} (${lines} lines)`;
    })
    .join("\n");
}

export function filesToRecord(
  files: Array<{ path: string; content: string }>,
): Record<string, string> {
  const record: Record<string, string> = {};
  for (const file of files) {
    if (file.path?.trim()) record[file.path] = file.content;
  }
  return record;
}

export function isValidEditOutput(
  edit: LessonEditResult | undefined,
): edit is LessonEditResult & {
  changedFiles: Array<{ path: string; content: string }>;
  summary: string;
} {
  return Boolean(
    edit?.changedFiles?.length &&
      edit.changedFiles.some(
        (f) => f.path?.trim() && f.content?.trim() && f.content.length > 20,
      ),
  );
}
