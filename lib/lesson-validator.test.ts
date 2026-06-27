import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prepareScormPackageFiles } from "./scorm-packager";
import {
  lessonResultToRecord,
  validateLesson,
  validateSingleFile,
} from "./lesson-validator";

const VALID_QUIZ = {
  "index.html": `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Quiz</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <main id="app">
    <h1>Safety Quiz</h1>
    <button id="submit">Submit</button>
  </main>
  <script type="module" src="./main.js"></script>
</body>
</html>`,
  "styles.css": `body { font-family: sans-serif; margin: 2rem; }
#app { max-width: 640px; }
button { padding: 0.5rem 1rem; }`,
  "main.js": `import { ScormAuthor } from "./scorm-api.js";

ScormAuthor.init();
document.getElementById("submit")?.addEventListener("click", () => {
  ScormAuthor.setScore(100);
  ScormAuthor.setStatus("completed");
});`,
  "scorm-api.js": `export const ScormAuthor = {
  init() { return true; },
  setScore(v) { return v; },
  setStatus(s) { return s; },
};`,
};

describe("validateLesson", () => {
  it("passes a valid minimal quiz lesson", () => {
    const result = validateLesson(VALID_QUIZ);
    assert.equal(result.ok, true);
    assert.equal(
      result.issues.filter((i) => i.severity === "error").length,
      0,
    );
  });

  it("fails when index.html is missing", () => {
    const { "index.html": _, ...rest } = VALID_QUIZ;
    const result = validateLesson(rest);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === "missing_index"));
  });

  it("fails on JS syntax error with path", () => {
    const broken = {
      ...VALID_QUIZ,
      "main.js": `export const x = ;`,
    };
    const result = validateLesson(broken);
    assert.equal(result.ok, false);
    const syntax = result.issues.find((i) => i.code === "js_syntax");
    assert.ok(syntax);
    assert.equal(syntax?.path, "main.js");
  });

  it("fails on placeholder text", () => {
    const withTodo = {
      ...VALID_QUIZ,
      "main.js": VALID_QUIZ["main.js"] + "\n// TODO: wire quiz",
    };
    const result = validateLesson(withTodo);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === "placeholder"));
  });

  it("passes SCORM dry-run for valid lesson", () => {
    const files = lessonResultToRecord(
      Object.entries(VALID_QUIZ).map(([path, content]) => ({ path, content })),
    );
    assert.doesNotThrow(() =>
      prepareScormPackageFiles(files, "Test Lesson"),
    );
    const result = validateLesson(files);
    assert.equal(result.ok, true);
  });
});

describe("validateSingleFile", () => {
  it("rejects invalid JS before write", () => {
    const issues = validateSingleFile(
      "main.js",
      "const broken = ;",
      VALID_QUIZ,
    );
    assert.ok(issues.some((i) => i.code === "js_syntax" && i.severity === "error"));
  });
});
