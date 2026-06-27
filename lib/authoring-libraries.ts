/** CDN libraries the AI can use in generated SCORM lessons (no build step). */

export type AuthoringLibrary = {
  id: string;
  name: string;
  tags: string[];
  description: string;
  usageHint: string;
};

export const AUTHORING_LIBRARIES: AuthoringLibrary[] = [
  {
    id: "three",
    name: "Three.js",
    tags: ["3d", "webgl", "simulation"],
    description: "3D scenes, models, animations — vanilla WebGL",
    usageHint: `Three.js (CDN module):
<script type="module" src="scene.js"></script>
// scene.js:
import * as THREE from "https://esm.sh/three";
import { OrbitControls } from "https://esm.sh/three/examples/jsm/controls/OrbitControls.js";`,
  },
  {
    id: "r3f",
    name: "React Three Fiber",
    tags: ["3d", "react", "interactive"],
    description: "Declarative 3D — use React.createElement, no JSX",
    usageHint: `R3F via import map (NO JSX):
<script type="importmap">{"imports":{"react":"https://esm.sh/react@18","react-dom/client":"https://esm.sh/react-dom@18/client","three":"https://esm.sh/three","@react-three/fiber":"https://esm.sh/@react-three/fiber?deps=react@18,three","@react-three/drei":"https://esm.sh/@react-three/drei?deps=react@18,three,@react-three/fiber"}}</script>
<script type="module" src="r3f-scene.js"></script>`,
  },
  {
    id: "gsap",
    name: "GSAP",
    tags: ["animation", "timeline"],
    description: "Professional animations and timelines",
    usageHint: `<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>`,
  },
  {
    id: "chartjs",
    name: "Chart.js",
    tags: ["charts", "data", "quiz"],
    description: "Interactive charts for data lessons",
    usageHint: `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>`,
  },
  {
    id: "matter",
    name: "Matter.js",
    tags: ["physics", "simulation", "game"],
    description: "2D physics simulations",
    usageHint: `<script src="https://cdn.jsdelivr.net/npm/matter-js@0.19.0/build/matter.min.js"></script>`,
  },
  {
    id: "lottie",
    name: "Lottie",
    tags: ["animation", "illustration"],
    description: "JSON vector animations",
    usageHint: `<script src="https://cdn.jsdelivr.net/npm/lottie-web/build/player/lottie.min.js"></script>`,
  },
  {
    id: "anime",
    name: "Anime.js",
    tags: ["animation", "micro-interaction"],
    description: "Lightweight animations",
    usageHint: `<script src="https://cdn.jsdelivr.net/npm/animejs@3/lib/anime.min.js"></script>`,
  },
  {
    id: "d3",
    name: "D3.js",
    tags: ["data-viz", "interactive"],
    description: "Data visualizations",
    usageHint: `<script src="https://cdn.jsdelivr.net/npm/d3@7"></script>`,
  },
  {
    id: "p5",
    name: "p5.js",
    tags: ["creative", "simulation"],
    description: "Creative coding sketches",
    usageHint: `<script src="https://cdn.jsdelivr.net/npm/p5@1/lib/p5.min.js"></script>`,
  },
  {
    id: "swiper",
    name: "Swiper",
    tags: ["carousel", "slides"],
    description: "Slide-based micro-learning",
    usageHint: `Swiper 11 from cdn.jsdelivr.net/npm/swiper@11 — CSS + JS for slide modules`,
  },
];

type LibraryMatchRule = {
  id: string;
  patterns: RegExp[];
  /** Also match when lesson files contain these substrings */
  fileMarkers?: string[];
};

const LIBRARY_MATCH_RULES: LibraryMatchRule[] = [
  {
    id: "three",
    patterns: [
      /\bthree\.?js\b/,
      /\b3d\b/,
      /\bwebgl\b/,
      /\bsolar system\b/,
      /\borbit(?:al|controls)?\b/,
      /\bplanet/,
      /\bmesh\b/,
      /\bthree\.js\b/,
    ],
    fileMarkers: ["esm.sh/three", "from \"three\"", "THREE."],
  },
  {
    id: "r3f",
    patterns: [
      /\breact three\b/,
      /\br3f\b/,
      /@react-three/,
      /\breact-three-fiber\b/,
    ],
    fileMarkers: ["@react-three/fiber", "@react-three/drei"],
  },
  {
    id: "gsap",
    patterns: [/\bgsap\b/, /\btimeline\b.*\banimat/],
    fileMarkers: ["gsap.min.js", "gsap."],
  },
  {
    id: "chartjs",
    patterns: [/\bchart\.?js\b/, /\bbar chart\b/, /\bline chart\b/, /\bpie chart\b/],
    fileMarkers: ["chart.js", "new Chart("],
  },
  {
    id: "matter",
    patterns: [/\bmatter\.?js\b/, /\bphysics simul/, /\b2d physics\b/],
    fileMarkers: ["matter-js", "Matter.Engine"],
  },
  {
    id: "lottie",
    patterns: [/\blottie\b/],
    fileMarkers: ["lottie-web", "lottie."],
  },
  {
    id: "anime",
    patterns: [/\banime\.?js\b/],
    fileMarkers: ["animejs", "anime("],
  },
  {
    id: "d3",
    patterns: [/\bd3\.?js\b/, /\bdata viz\b/, /\bvisualization\b/],
    fileMarkers: ["d3@7", "d3.select"],
  },
  {
    id: "p5",
    patterns: [/\bp5\.?js\b/, /\bcreative coding\b/],
    fileMarkers: ["p5.min.js", "function setup("],
  },
  {
    id: "swiper",
    patterns: [/\bswiper\b/, /\bslide deck\b/, /\bcarousel\b/, /\bslides\b/],
    fileMarkers: ["swiper@11", "new Swiper("],
  },
];

export const QUIZ_KEYWORD_PATTERN =
  /\bquiz\b|\bmcq\b|multiple choice|true\/false|true or false|assessment|question|drag.?and.?drop|matching activity|fill.?in.?the.?blank|pass\/fail|score\b/i;

export function matchesQuizIntent(text: string): boolean {
  return QUIZ_KEYWORD_PATTERN.test(text);
}

export function matchesThreeDIntent(text: string): boolean {
  return LIBRARY_MATCH_RULES.filter((r) => r.id === "three" || r.id === "r3f")
    .some((r) => r.patterns.some((p) => p.test(text)));
}

function matchLibrariesInText(text: string): Set<string> {
  const lower = text.toLowerCase();
  const ids = new Set<string>();
  for (const rule of LIBRARY_MATCH_RULES) {
    if (rule.patterns.some((p) => p.test(lower))) {
      ids.add(rule.id);
    }
  }
  return ids;
}

function matchLibrariesInFiles(files: Record<string, string>): Set<string> {
  const ids = new Set<string>();
  const combined = Object.values(files).join("\n").toLowerCase();
  if (!combined.trim()) return ids;

  for (const rule of LIBRARY_MATCH_RULES) {
    if (rule.fileMarkers?.some((m) => combined.includes(m.toLowerCase()))) {
      ids.add(rule.id);
    }
  }
  return ids;
}

export type RelevantLibraryOptions = {
  userMessage: string;
  /** Recent user messages for broader intent (optional) */
  recentUserText?: string;
  existingFiles?: Record<string, string>;
  mode?: "create" | "edit";
};

export function getRelevantLibraries(
  options: RelevantLibraryOptions,
): AuthoringLibrary[] {
  const { userMessage, recentUserText, existingFiles, mode = "create" } =
    options;

  const corpus = [userMessage, recentUserText].filter(Boolean).join("\n");
  const matchedIds = matchLibrariesInText(corpus);

  if (existingFiles) {
    for (const id of matchLibrariesInFiles(existingFiles)) {
      matchedIds.add(id);
    }
  }

  // Edit touching 3D files → keep Three.js available when user mentions 3D/scene
  if (mode === "edit" && existingFiles?.["scene.js"]) {
    if (matchesThreeDIntent(corpus) || /scene\.js|r3f|three/i.test(userMessage)) {
      matchedIds.add("three");
    }
  }

  return AUTHORING_LIBRARIES.filter((lib) => matchedIds.has(lib.id));
}

/** Names + one-liners only — used when no specific library is matched. */
export function getMinimalLibraryCatalog(): string {
  const lines = AUTHORING_LIBRARIES.map(
    (lib) => `- **${lib.name}**: ${lib.description}`,
  );
  return `## Available CDN libraries (use only if needed)
${lines.join("\n")}
Full import snippets are provided when a library is relevant to the request.`;
}

export function getLibraryPromptSection(
  libraries: AuthoringLibrary[],
  options?: { includeHints?: boolean },
): string {
  const includeHints = options?.includeHints ?? libraries.length > 0;

  if (libraries.length === 0) {
    return getMinimalLibraryCatalog();
  }

  const list = libraries
    .map((lib) => `- **${lib.name}** (${lib.tags.join(", ")}): ${lib.description}`)
    .join("\n");

  if (!includeHints) {
    return `## Relevant libraries for this request
${list}`;
  }

  const hints = libraries
    .map((lib) => `### ${lib.name}\n${lib.usageHint}`)
    .join("\n\n");

  return `## Relevant libraries for this request (CDN — no build step)
${list}

${hints}`;
}

export function describeLibraryInjection(
  libraries: AuthoringLibrary[],
  options: RelevantLibraryOptions & { includeQuizPatterns?: boolean },
): string {
  const names =
    libraries.length > 0
      ? libraries.map((l) => l.name).join(", ")
      : "minimal catalog";
  const extras: string[] = [];
  if (options.includeQuizPatterns) extras.push("quiz patterns");
  if (matchesThreeDIntent(options.userMessage)) extras.push("WebGL rules");
  const suffix = extras.length ? ` + ${extras.join(", ")}` : "";
  return `${names}${suffix}`;
}
