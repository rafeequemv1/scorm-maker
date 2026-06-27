function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Bundle index.html + linked CSS/JS into one document for iframe srcDoc preview. */
export function buildPreviewDocument(
  contents: Record<string, string>,
): string | null {
  const indexPath = Object.keys(contents).find(
    (path) => path.toLowerCase() === "index.html",
  );
  if (!indexPath) return null;

  let html = contents[indexPath];

  for (const [path, content] of Object.entries(contents)) {
    if (!path.endsWith(".css")) continue;
    const name = path.split("/").pop()!;
    const patterns = [
      `<link[^>]+href=["'](?:\\./)?${escapeRegExp(name)}["'][^>]*\\/?>`,
      `<link[^>]+href=["'](?:\\./)?${escapeRegExp(path)}["'][^>]*\\/?>`,
    ];
    for (const pattern of patterns) {
      html = html.replace(new RegExp(pattern, "gi"), `<style>\n${content}\n</style>`);
    }
  }

  for (const [path, content] of Object.entries(contents)) {
    if (!path.endsWith(".js")) continue;
    const name = path.split("/").pop()!;
    const patterns = [
      `<script[^>]+src=["'](?:\\./)?${escapeRegExp(name)}["'][^>]*>\\s*</script>`,
      `<script[^>]+src=["'](?:\\./)?${escapeRegExp(path)}["'][^>]*>\\s*</script>`,
      `<script[^>]+type=["']module["'][^>]+src=["'](?:\\./)?${escapeRegExp(name)}["'][^>]*>\\s*</script>`,
      `<script[^>]+type=["']module["'][^>]+src=["'](?:\\./)?${escapeRegExp(path)}["'][^>]*>\\s*</script>`,
    ];
    for (const pattern of patterns) {
      const isModule = pattern.includes("module");
      const replacement = isModule
        ? `<script type="module">\n${content}\n</script>`
        : `<script>\n${content}\n</script>`;
      html = html.replace(new RegExp(pattern, "gi"), replacement);
    }
  }

  return html;
}
