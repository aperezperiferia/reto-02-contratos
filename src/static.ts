import fs from "node:fs/promises";
import path from "node:path";
import type http from "node:http";

const WEB_ROOT = path.join(process.cwd(), "dist", "web");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export async function tryServeStatic(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<boolean> {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if (url.pathname.startsWith("/api")) return false;

  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const filePath = path.normalize(path.join(WEB_ROOT, rel));
  if (!filePath.startsWith(WEB_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return true;
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error("not file");
    const ext = path.extname(filePath);
    const body = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    if (req.method === "HEAD") res.end();
    else res.end(body);
    return true;
  } catch {
    try {
      const index = await fs.readFile(path.join(WEB_ROOT, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(index);
      return true;
    } catch {
      return false;
    }
  }
}

export async function hasStaticBuild(): Promise<boolean> {
  try {
    await fs.access(path.join(WEB_ROOT, "index.html"));
    return true;
  } catch {
    return false;
  }
}
