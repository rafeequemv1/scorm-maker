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

export function getLibraryPromptSection(): string {
  const list = AUTHORING_LIBRARIES.map(
    (lib) => `- **${lib.name}** (${lib.tags.join(", ")}): ${lib.description}`,
  ).join("\n");

  const hints = AUTHORING_LIBRARIES.map(
    (lib) => `### ${lib.name}\n${lib.usageHint}`,
  ).join("\n\n");

  return `## Supported libraries (CDN — no build step)
${list}

${hints}`;
}
