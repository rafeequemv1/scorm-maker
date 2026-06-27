function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mimeFor(path: string): string {
  if (path.endsWith(".html")) return "text/html;charset=utf-8";
  if (path.endsWith(".css")) return "text/css;charset=utf-8";
  if (path.endsWith(".js") || path.endsWith(".mjs"))
    return "text/javascript;charset=utf-8";
  if (path.endsWith(".json")) return "application/json;charset=utf-8";
  return "text/plain;charset=utf-8";
}

const PREVIEW_BOOTSTRAP = `<script>
(function(){
  function showErr(msg){
    var el=document.getElementById("__scormforge_err");
    if(!el){el=document.createElement("div");el.id="__scormforge_err";
      el.style.cssText="position:fixed;bottom:0;left:0;right:0;max-height:40%;overflow:auto;background:#450a0a;color:#fecaca;padding:8px 12px;font:12px/1.4 monospace;z-index:99999";
      document.body.appendChild(el);}
    el.textContent=msg;
  }
  window.addEventListener("error",function(e){showErr("JS error: "+(e.message||e));});
  window.addEventListener("unhandledrejection",function(e){showErr("Promise error: "+(e.reason&&e.reason.message||e.reason));});
})();
</script>`;

function rewriteLocalImports(
  content: string,
  pathToUrl: Map<string, string>,
): string {
  let out = content;
  for (const [path, url] of pathToUrl) {
    const name = path.split("/").pop()!;
    const patterns = [
      new RegExp(`(from\\s+["'])(?:\\./)?${escapeRegExp(name)}(["'])`, "gi"),
      new RegExp(`(from\\s+["'])(?:\\./)?${escapeRegExp(path)}(["'])`, "gi"),
      new RegExp(
        `(import\\s*\\(["'])(?:\\./)?${escapeRegExp(name)}(["']\\))`,
        "gi",
      ),
      new RegExp(
        `(import\\s*\\(["'])(?:\\./)?${escapeRegExp(path)}(["']\\))`,
        "gi",
      ),
    ];
    for (const pattern of patterns) {
      out = out.replace(pattern, `$1${url}$2`);
    }
  }
  return out;
}

function rewriteHtmlReferences(
  html: string,
  pathToUrl: Map<string, string>,
): string {
  let out = html;
  for (const [path, url] of pathToUrl) {
    const name = path.split("/").pop()!;
    const replacements = [
      new RegExp(`(src=["'])(?:\\./)?${escapeRegExp(name)}(["'])`, "gi"),
      new RegExp(`(src=["'])(?:\\./)?${escapeRegExp(path)}(["'])`, "gi"),
      new RegExp(`(href=["'])(?:\\./)?${escapeRegExp(name)}(["'])`, "gi"),
      new RegExp(`(href=["'])(?:\\./)?${escapeRegExp(path)}(["'])`, "gi"),
    ];
    for (const pattern of replacements) {
      out = out.replace(pattern, `$1${url}$2`);
    }
    out = out.replace(
      new RegExp(`"${escapeRegExp(name)}"\\s*:`, "g"),
      `"${url}":`,
    );
    out = rewriteLocalImports(out, new Map([[path, url]]));
  }
  return out;
}

function createBlobUrl(content: string, path: string): string {
  return URL.createObjectURL(new Blob([content], { type: mimeFor(path) }));
}

/** Replace local file references in HTML with blob URLs so ES modules + Three.js work. */
export function buildPreviewBlobUrl(
  contents: Record<string, string>,
  existingUrls: string[] = [],
): { url: string; allUrls: string[] } | null {
  if (typeof window === "undefined") return null;

  for (const url of existingUrls) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }

  const indexPath = Object.keys(contents).find(
    (p) => p.toLowerCase() === "index.html",
  );
  if (!indexPath) return null;

  const assetPaths = Object.keys(contents).filter(
    (p) => p.toLowerCase() !== "index.html" && contents[p]?.trim(),
  );

  const blobUrls: string[] = [];
  const pathToUrl = new Map<string, string>();

  // Pass 1: provisional blob URLs so we can rewrite cross-imports in JS modules
  for (const path of assetPaths) {
    const url = createBlobUrl(contents[path], path);
    pathToUrl.set(path, url);
    blobUrls.push(url);
  }

  // Pass 2: recreate JS blobs with local imports pointing at sibling blob URLs
  for (const path of assetPaths) {
    if (!path.endsWith(".js") && !path.endsWith(".mjs")) continue;

    const siblings = new Map<string, string>();
    for (const [p, url] of pathToUrl) {
      if (p !== path) siblings.set(p, url);
    }

    const rewritten = rewriteLocalImports(contents[path], siblings);
    if (rewritten === contents[path]) continue;

    URL.revokeObjectURL(pathToUrl.get(path)!);
    const url = createBlobUrl(rewritten, path);
    pathToUrl.set(path, url);
    blobUrls.push(url);
  }

  let html = rewriteHtmlReferences(contents[indexPath], pathToUrl);

  // Inline CSS for faster paint
  for (const path of assetPaths) {
    if (!path.endsWith(".css")) continue;
    const content = contents[path];
    const name = path.split("/").pop()!;
    const patterns = [
      `<link[^>]+href=["'](?:\\./)?${escapeRegExp(name)}["'][^>]*\\/?>`,
      `<link[^>]+href=["'](?:\\./)?${escapeRegExp(path)}["'][^>]*\\/?>`,
    ];
    for (const pattern of patterns) {
      html = html.replace(
        new RegExp(pattern, "gi"),
        `<style>\n${content}\n</style>`,
      );
    }
  }

  const layoutFix = `<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden}canvas{display:block;width:100%!important;height:100%!important}</style>`;

  if (html.includes("</head>")) {
    html = html.replace("</head>", `${layoutFix}\n</head>`);
  } else {
    html = layoutFix + html;
  }

  if (html.includes("</body>")) {
    html = html.replace("</body>", `${PREVIEW_BOOTSTRAP}\n</body>`);
  } else {
    html += PREVIEW_BOOTSTRAP;
  }

  const mainUrl = createBlobUrl(html, "index.html");
  blobUrls.push(mainUrl);

  return { url: mainUrl, allUrls: blobUrls };
}

export function revokePreviewBlobUrls(urls: string[]) {
  for (const url of urls) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }
}

/** @deprecated use buildPreviewBlobUrl on client */
export function buildPreviewDocument(
  contents: Record<string, string>,
): string | null {
  const indexPath = Object.keys(contents).find(
    (path) => path.toLowerCase() === "index.html",
  );
  if (!indexPath) return null;
  return contents[indexPath];
}
