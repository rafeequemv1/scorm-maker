import JSZip from "jszip";

const SCORM_API_JS = `var ScormAuthor = (function () {
  var API = null;
  var initialized = false;

  function findAPI(win) {
    var attempts = 0;
    while (!win.API && win.parent && win.parent !== win && attempts <= 500) {
      attempts++;
      win = win.parent;
    }
    return win.API;
  }

  function findAPI_1_3(win) {
    var attempts = 0;
    while (!win.API_1484_11 && win.parent && win.parent !== win && attempts <= 500) {
      attempts++;
      win = win.parent;
    }
    return win.API_1484_11;
  }

  function lmsSet(key, value) {
    if (!API) return false;
    if (API.LMSSetValue) return API.LMSSetValue(key, value) === "true";
    if (API.SetValue) return API.SetValue(key, value) === "true";
    return false;
  }

  function lmsCommit() {
    if (!API) return;
    if (API.LMSCommit) API.LMSCommit("");
    else if (API.Commit) API.Commit("");
  }

  return {
    init: function () {
      if (initialized) return Boolean(API);
      API = findAPI(window) || findAPI_1_3(window);
      if (!API) return false;
      if (API.LMSInitialize) {
        API.LMSInitialize("");
        lmsSet("cmi.core.lesson_status", "incomplete");
        lmsSet("cmi.core.lesson_location", "0");
      } else if (API.Initialize) {
        API.Initialize("");
        lmsSet("cmi.completion_status", "incomplete");
        lmsSet("cmi.location", "0");
      }
      initialized = true;
      return true;
    },

    setProgress: function (percent) {
      var p = Math.max(0, Math.min(100, Math.round(percent)));
      lmsSet("cmi.core.lesson_location", String(p));
      lmsSet("cmi.suspend_data", JSON.stringify({ progress: p }));
      lmsCommit();
    },

    setScore: function (raw, min, max) {
      var r = String(raw);
      var lo = String(min == null ? 0 : min);
      var hi = String(max == null ? 100 : max);
      if (API && API.LMSSetValue) {
        lmsSet("cmi.core.score.raw", r);
        lmsSet("cmi.core.score.min", lo);
        lmsSet("cmi.core.score.max", hi);
      } else {
        lmsSet("cmi.score.raw", r);
        lmsSet("cmi.score.min", lo);
        lmsSet("cmi.score.max", hi);
      }
      lmsCommit();
    },

    recordInteraction: function (id, type, result, learnerResponse) {
      var idx = 0;
      lmsSet("cmi.interactions." + idx + ".id", String(id));
      lmsSet("cmi.interactions." + idx + ".type", type || "choice");
      lmsSet("cmi.interactions." + idx + ".result", result || "neutral");
      if (learnerResponse != null) {
        lmsSet("cmi.interactions." + idx + ".learner_response", String(learnerResponse));
      }
      lmsCommit();
    },

    complete: function (passed, score) {
      if (!API) return;
      var ok = passed !== false;
      if (score != null) this.setScore(score, 0, 100);
      if (API.LMSSetValue) {
        lmsSet("cmi.core.lesson_status", ok ? "completed" : "failed");
        if (!ok) lmsSet("cmi.core.exit", "suspend");
        lmsCommit();
        API.LMSFinish("");
      } else if (API.SetValue) {
        lmsSet("cmi.completion_status", ok ? "completed" : "incomplete");
        lmsSet("cmi.success_status", ok ? "passed" : "failed");
        lmsCommit();
        API.Terminate("");
      }
    },
  };
})();

window.ScormAuthor = ScormAuthor;
window.addEventListener("DOMContentLoaded", function () {
  ScormAuthor.init();
});
`;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "scorm-lesson";
}

function prepareIndexForScorm(html: string): string {
  const inject = `\n<script src="scorm-api.js"></script>\n`;
  if (html.includes("</body>")) {
    return html.replace("</body>", `${inject}</body>`);
  }
  return `${html}\n${inject}`;
}

export function buildImsManifest(
  title: string,
  filePaths: string[],
  identifier: string,
): string {
  const launchFile =
    filePaths.find((p) => p.toLowerCase() === "index.html") ?? filePaths[0];
  const fileEntries = filePaths
    .map((path) => `      <file href="${escapeXml(path)}"/>`)
    .join("\n");

  return `<?xml version="1.0" standalone="no"?>
<manifest identifier="${escapeXml(identifier)}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                      http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG-001">
    <organization identifier="ORG-001">
      <title>${escapeXml(title)}</title>
      <item identifier="ITEM-001" identifierref="RES-001">
        <title>${escapeXml(title)}</title>
        <adlcp:masteryscore>80</adlcp:masteryscore>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-001" type="webcontent" adlcp:scormtype="sco" href="${escapeXml(launchFile)}">
${fileEntries}
      <file href="scorm-api.js"/>
    </resource>
  </resources>
</manifest>`;
}

export function prepareScormPackageFiles(
  files: Record<string, string>,
  title = "SCORM Lesson",
): Array<{ path: string; content: string }> {
  const paths = Object.keys(files).filter((p) => files[p]?.trim());
  if (paths.length === 0) {
    throw new Error("No files to package. Generate a lesson first.");
  }

  const packageFiles: Array<{ path: string; content: string }> = [];

  for (const path of paths) {
    let content = files[path];
    if (path.toLowerCase() === "index.html") {
      content = prepareIndexForScorm(content);
    }
    packageFiles.push({ path, content });
  }

  if (!paths.some((p) => p.toLowerCase() === "index.html")) {
    throw new Error("index.html is required for a SCORM package.");
  }

  packageFiles.push({ path: "scorm-api.js", content: SCORM_API_JS });

  const manifestPaths = [...paths, "scorm-api.js"];
  packageFiles.push({
    path: "imsmanifest.xml",
    content: buildImsManifest(title, manifestPaths, `scormforge-${Date.now()}`),
  });

  return packageFiles;
}

export async function downloadScormPackage(
  files: Record<string, string>,
  title = "SCORM Lesson",
): Promise<void> {
  const packageFiles = prepareScormPackageFiles(files, title);
  const zip = new JSZip();

  for (const file of packageFiles) {
    zip.file(file.path, file.content);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slugify(title)}-scorm.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
}
