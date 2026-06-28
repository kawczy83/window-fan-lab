import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const indexHtml = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appJs = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

function matches(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

function filePathForRequest(url) {
  const pathname = new URL(url, "http://127.0.0.1").pathname;
  const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const filePath = path.resolve(repoRoot, relativePath);
  const rootPrefix = repoRoot.endsWith(path.sep) ? repoRoot : `${repoRoot}${path.sep}`;
  return filePath.startsWith(rootPrefix) ? filePath : null;
}

function createStaticServer() {
  const server = http.createServer((req, res) => {
    const filePath = req.url ? filePathForRequest(req.url) : null;
    if (!filePath) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }

      res.writeHead(200, { "content-type": contentTypeFor(filePath) });
      res.end(data);
    });
  });

  return server;
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

test("index.html has unique element IDs", () => {
  const ids = matches(indexHtml, /\bid="([^"]+)"/g);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);

  assert.deepEqual([...new Set(duplicates)], []);
});

test("app DOM references all point at elements in index.html", () => {
  const ids = new Set(matches(indexHtml, /\bid="([^"]+)"/g));
  const refs = matches(appJs, /(?:getElementById|byId)\(\s*["']([^"']+)["']\s*\)/g);
  const missing = refs.filter((id) => !ids.has(id));

  assert.deepEqual([...new Set(missing)], []);
});

test("index.html declares the app stylesheet and module entrypoint", () => {
  assert.match(indexHtml, /<link\s+rel="stylesheet"\s+href="styles\.css">/);
  assert.match(indexHtml, /<script\s+type="module"\s+src="js\/app\.js"><\/script>/);
});

test("static server returns the app entrypoint and local assets", async () => {
  const server = createStaticServer();
  const baseUrl = await listen(server);

  try {
    for (const asset of [
      {
        pathname: "/",
        contentType: "text/html",
        body: '<script type="module" src="js/app.js"></script>',
      },
      {
        pathname: "/styles.css",
        contentType: "text/css",
        body: ":root",
      },
      {
        pathname: "/js/app.js",
        contentType: "text/javascript",
        body: 'from "./model.js";',
      },
      {
        pathname: "/js/model.js",
        contentType: "text/javascript",
        body: "export {",
      },
    ]) {
      const response = await fetch(`${baseUrl}${asset.pathname}`);
      const text = await response.text();

      assert.equal(response.status, 200, asset.pathname);
      assert.match(response.headers.get("content-type") || "", new RegExp(`^${asset.contentType}`));
      assert.ok(text.includes(asset.body), asset.pathname);
    }
  } finally {
    await close(server);
  }
});
