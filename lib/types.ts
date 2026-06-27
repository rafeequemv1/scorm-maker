import { UIMessage } from "ai";
import { z } from "zod";

export const messageMetadataSchema = z.object({
  previewUrl: z.string().optional(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

export type BuilderUIMessage = UIMessage<
  MessageMetadata,
  {
    preview: {
      url: string;
      status: "loading" | "ready" | "error";
    };
    files: {
      paths: string[];
    };
    fileContent: {
      path: string;
      content: string;
    };
    status: {
      message: string;
    };
  }
>;

export type ProjectFile = {
  path: string;
  content: string;
};

export const PREVIEW_PORT = 4173;
export const SANDBOX_WORKDIR = "/vercel/sandbox";

export const DEFAULT_INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SCORM Lesson</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main class="lesson">
    <p class="eyebrow">SCORM Forge</p>
    <h1>Your interactive lesson starts here</h1>
    <p class="subtitle">Describe a quiz, simulation, or 3D activity in the chat — then export as SCORM.</p>
    <button class="cta" type="button">Begin lesson</button>
  </main>
  <script src="script.js"></script>
</body>
</html>`;

export const DEFAULT_STYLES_CSS = `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: system-ui, -apple-system, sans-serif;
  min-height: 100vh;
  background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%);
  color: #f8fafc;
  display: grid;
  place-items: center;
}

.hero, .lesson {
  text-align: center;
  padding: 2rem;
  max-width: 640px;
}

.eyebrow {
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #a5b4fc;
  margin-bottom: 1rem;
}

h1 {
  font-size: clamp(2rem, 5vw, 3.5rem);
  font-weight: 700;
  line-height: 1.1;
  margin-bottom: 1rem;
}

.subtitle {
  font-size: 1.125rem;
  color: #cbd5e1;
  margin-bottom: 2rem;
  line-height: 1.6;
}

.cta {
  background: #6366f1;
  color: white;
  border: none;
  padding: 0.875rem 2rem;
  font-size: 1rem;
  font-weight: 600;
  border-radius: 9999px;
  cursor: pointer;
  transition: transform 0.2s, background 0.2s;
}

.cta:hover {
  background: #818cf8;
  transform: translateY(-2px);
}
`;

export const DEFAULT_SCRIPT_JS = `document.querySelector('.cta')?.addEventListener('click', () => {
  if (window.ScormAuthor) {
    ScormAuthor.init();
    ScormAuthor.setProgress(10);
  }
});
`;
