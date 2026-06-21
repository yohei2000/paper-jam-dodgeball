import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve("dist");
const port = Number(process.env.PORT || 43173);
const basePath = "/paper-jam-dodgeball";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function resolveRequestPath(url) {
  const decoded = decodeURIComponent(new URL(url, `http://127.0.0.1:${port}`).pathname);
  const stripped = decoded.startsWith(`${basePath}/`) ? decoded.slice(basePath.length) : decoded;
  const normalized = normalize(stripped).replace(/^(\.\.[/\\])+/, "");
  const target = resolve(join(root, normalized === "/" ? "index.html" : normalized));
  if (!target.startsWith(root)) return join(root, "index.html");
  return target;
}

const server = createServer(async (request, response) => {
  try {
    let filePath = resolveRequestPath(request.url || "/");
    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat || fileStat.isDirectory()) {
      filePath = join(root, "index.html");
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`Server error: ${error.message}`);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Serving dist at http://127.0.0.1:${port}/`);
});
