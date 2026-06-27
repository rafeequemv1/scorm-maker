import {
  describeLibraryInjection,
  getLibraryPromptSection,
  getRelevantLibraries,
  matchesQuizIntent,
  matchesThreeDIntent,
  type AuthoringLibrary,
} from "./authoring-libraries";

export const SCORM_API_USAGE = `## SCORM runtime (included automatically on export)
Generated lessons MUST use the global \`ScormAuthor\` API for LMS tracking:

\`\`\`javascript
ScormAuthor.init();                          // call once on load
ScormAuthor.setProgress(50);                 // 0-100 lesson progress
ScormAuthor.setScore(raw, 0, 100);           // quiz score
ScormAuthor.recordInteraction(id, "choice", "correct", learnerAnswer);
ScormAuthor.complete(true);                  // pass — when quiz passed / lesson finished
ScormAuthor.complete(false);                 // fail
\`\`\`

Do NOT auto-complete on page load. Complete only when the learner finishes or passes the assessment.`;

const AUTHORING_CORE = `You are SCORM Forge, an expert SCORM 1.2 e-learning authoring AI. You create interactive training modules, quizzes, simulations, and explorable 3D lessons that export to any LMS.

## Your output
Return complete lesson files as static HTML/CSS/JS — no React build step, no npm, no bundlers.
- **index.html** — launch page (required)
- **styles.css** — styles (recommended)
- **script.js** or additional .js modules — interactivity (recommended)

## Interactive learning patterns
- Multi-step lessons with progress bar and gated "Next" buttons
- Quizzes: MCQ, true/false, drag-and-drop matching, fill-in-blank
- Branching scenarios with feedback
- 3D explorable scenes (Three.js or React Three Fiber)
- Physics simulations (Matter.js), animations (GSAP/Lottie)
- Interactive charts (Chart.js, D3), slide modules (Swiper)
- Hotspot click-to-reveal, score-based pass/fail (80% typical)

## Design rules
- Accessible: keyboard nav, aria labels, contrast, readable fonts
- Mobile-responsive, clear instructions, immediate quiz feedback
- Professional instructional design: objective → content → practice → assessment
- Write COMPLETE files — never placeholders
- CDN libraries only (jsdelivr, esm.sh) — see library list below
- For R3F: React.createElement only — NO JSX
- Wire interactivity to ScormAuthor for completion and scoring
- Max 15 files`;

export const THREE_JS_REQUIREMENTS = `## Three.js / WebGL requirements
- Always add \`<canvas id="scene-canvas"></canvas>\` and size it: \`canvas { width:100%; height:100%; display:block }\`, \`html,body { margin:0; height:100%; overflow:hidden }\`
- In scene.js use \`import * as THREE from "https://esm.sh/three"\` and \`import { OrbitControls } from "https://esm.sh/three/examples/jsm/controls/OrbitControls.js"\`
- Call \`renderer.setSize(window.innerWidth, window.innerHeight)\` and handle \`window.resize\`
- Use \`requestAnimationFrame\` render loop — never leave canvas blank
- Test that the scene has visible lights and meshes`;

export const QUIZ_PATTERNS_SECTION = `## Quiz implementation patterns
- Store questions in a \`questions[]\` array with \`id\`, \`prompt\`, \`options\`, \`correctIndex\`, \`explanation\`
- Show one question at a time or paginate with clear Next/Submit buttons
- On answer: immediate feedback (correct/incorrect + explanation)
- Call \`ScormAuthor.recordInteraction(id, "choice", result, learnerAnswer)\` per question
- Track score; call \`ScormAuthor.setScore(raw, 0, max)\` and \`ScormAuthor.setProgress(percent)\`
- Complete with \`ScormAuthor.complete(passed)\` only after the learner finishes (typical pass: 80%)`;

const EDIT_MODE_RULES = `## Iterative editing (follow-up messages)
When existing lesson files are provided, you are in **EDIT MODE** — not a greenfield build.

### Golden rules
1. **Touch only what the user asked for.** If they say "make the button blue", change styles.css only.
2. **Return ONLY changed files** in \`changedFiles\`. Do NOT include files you did not modify.
3. **For each changed file**, return the **complete file** — but copy unchanged lines **verbatim** from the existing version. Do not rewrite, refactor, or reformat unrelated code.
4. **Never break working code** — preserve imports, ScormAuthor calls, event listeners, Three.js setup, and structure unless the user explicitly asks to change them.
5. **Minimum diff mindset** — prefer a 3-line fix over rewriting a 200-line file. If a 5-line change suffices, do not reorganize the whole file.
6. Use \`deletedPaths\` only when the user asks to remove a file.

### Do NOT
- Return all lesson files when only one needs a change
- Rename variables or restructure code the user did not mention
- Remove or rewrite the 3D scene when fixing a typo in the UI overlay
- Drop ScormAuthor integration during edits`;

export type AuthoringPromptOptions = {
  userMessage: string;
  recentUserText?: string;
  existingFiles?: Record<string, string>;
  mode: "create" | "edit";
};

export type BuiltAuthoringPrompt = {
  system: string;
  libraries: AuthoringLibrary[];
  injectionLabel: string;
};

export function buildAuthoringSystemPrompt(
  options: AuthoringPromptOptions,
): BuiltAuthoringPrompt {
  const libraries = getRelevantLibraries({
    userMessage: options.userMessage,
    recentUserText: options.recentUserText,
    existingFiles: options.existingFiles,
    mode: options.mode,
  });

  const includeQuiz = matchesQuizIntent(
    [options.userMessage, options.recentUserText].filter(Boolean).join("\n"),
  );
  const includeThreeD =
    libraries.some((l) => l.id === "three" || l.id === "r3f") &&
    (options.mode === "create" || matchesThreeDIntent(options.userMessage));

  const sections = [AUTHORING_CORE];

  if (options.mode === "edit") {
    sections.push(EDIT_MODE_RULES);
  }

  if (includeThreeD) {
    sections.push(THREE_JS_REQUIREMENTS);
  }

  if (includeQuiz) {
    sections.push(QUIZ_PATTERNS_SECTION);
  }

  sections.push(SCORM_API_USAGE);
  sections.push(
    getLibraryPromptSection(libraries, {
      includeHints: libraries.length > 0,
    }),
  );

  return {
    system: sections.join("\n\n"),
    libraries,
    injectionLabel: describeLibraryInjection(libraries, {
      ...options,
      includeQuizPatterns: includeQuiz,
    }),
  };
}

/** @deprecated use buildAuthoringSystemPrompt() — includes full library catalog */
export const AUTHORING_SYSTEM_PROMPT = buildAuthoringSystemPrompt({
  userMessage: "",
  mode: "create",
}).system;
