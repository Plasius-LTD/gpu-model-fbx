import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { ascii, binary } from "../tests/fixtures/fbx.ts";
import { sceneFixture } from "../tests/fixtures/scene.ts";
const cache = path.resolve(process.env.FBX_BUILD_CACHE ?? ".fbx-build-cache", "browser"); await mkdir(cache, { recursive: true });
await build({ entryPoints: { client: "tests/browser/client.mjs" }, bundle: true, splitting: true, chunkNames: "client-chunks/[name]-[hash]", format: "esm", platform: "browser", alias: { "fbx-under-test": path.resolve(process.env.FBX_PACKAGE_DIST ?? "dist", "index.js") }, outdir: cache });
const fixtures = JSON.stringify({ ascii: [...ascii], binary: [...binary()], compressed: [...binary({ compressed: true })], quad: [...binary({ quad: true })], adversarial: [...binary({ compressed: true, declaredVertices: 0x20000000 })], expanded: [...binary({ compressed: true, expandedVertices: true })],
  attributes:[...sceneFixture({attributes:true,materials:true,twoFaces:true})],geometryMetres:[...sceneFixture({attributes:true,geometric:true})],geometryCentimetres:[...sceneFixture({attributes:true,geometric:true,centimetres:true})],hierarchy:[...sceneFixture({hierarchy:true,rotation:90,pivot:.25,inherit:0})],phong:[...sceneFixture({materials:true,phong:true})],binaryAttributes:[...binary({compressed:true,attributes:true,lambert:true})],
  unsupported:[...new TextEncoder().encode(new TextDecoder().decode(ascii).replace('Model: 2,','Deformer: 3, "Deformer::Skin", "Skin" {}\n Model: 2,'))],
});
const requests = [];
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1"); requests.push({ path: url.pathname, method: request.method });
  response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  if (url.searchParams.get("isolated") === "1") { response.setHeader("Cross-Origin-Opener-Policy", "same-origin"); response.setHeader("Cross-Origin-Embedder-Policy", "require-corp"); }
  response.setHeader("Cache-Control", "no-store");
  try {
    if (url.pathname === "/") { response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>FBX worker qualification</title><button>Run qualification</button><pre aria-live="polite">Ready</pre><script type="module" src="/client.js"></script></html>'); }
    else if (url.pathname === "/fixtures.json") { response.setHeader("Content-Type", "application/json"); response.end(fixtures); }
    else if (url.pathname === "/triangle.fbx") { response.setHeader("Content-Type", "application/octet-stream"); response.end(binary()); }
    else if (url.pathname === "/hang-worker.js") { response.setHeader("Content-Type", "text/javascript"); response.end("onmessage = () => { while (true) {} };"); }
    else if (url.pathname === "/client.js") { response.setHeader("Content-Type", "text/javascript"); response.end(await readFile(path.join(cache, "client.js"))); }
    else if (/^\/client-chunks\/[a-zA-Z0-9_-]+\.js$/u.test(url.pathname)) { response.setHeader("Content-Type", "text/javascript"); response.end(await readFile(path.join(cache, url.pathname.slice(1)))); }
    else if (/^\/[a-zA-Z0-9_-]+\.(?:js|mjs)$/u.test(url.pathname)) { response.setHeader("Content-Type", "text/javascript"); response.end(await readFile(path.join(process.env.FBX_PACKAGE_DIST ?? "dist", url.pathname.slice(1)))); }
    else { response.statusCode = 404; response.end(); }
  } catch { response.statusCode = 404; response.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
if (process.argv.includes("--serve")) { console.log(`FBX browser fixture: ${base}/?isolated=1`); }
else {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.FBX_BROWSER_EXECUTABLE ? { executablePath: process.env.FBX_BROWSER_EXECUTABLE } : {}) });
    const proofs = [];
    for (const isolated of [false, true]) {
      const context = await browser.newContext(); const page = await context.newPage(); const errors = [];
      page.on("pageerror", error => errors.push(String(error)));
      await page.goto(`${base}/?isolated=${isolated ? 1 : 0}`); await page.getByRole("button", { name: "Run qualification" }).click();
      await page.waitForFunction(() => globalThis.fbxProof || globalThis.fbxFailure, undefined, { timeout: 30_000 });
      const result = await page.evaluate(() => ({ proof: globalThis.fbxProof, failure: globalThis.fbxFailure }));
      assert.equal(result.failure, undefined); assert.deepEqual(errors, []); assert.equal(result.proof.crossOriginIsolated, isolated);
      proofs.push(result.proof); await context.close();
    }
    assert.ok(requests.every(request => request.method === "GET" && !request.path.includes("should-not-load")));
    await writeFile(path.join(cache, "proof.json"), JSON.stringify({ proofs, requests }, null, 2));
    console.log(`Real Chromium worker checks passed (${proofs.map(proof => proof.checks.length).join("+")} checks, isolated + non-isolated); proof: ${cache}/proof.json`);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
