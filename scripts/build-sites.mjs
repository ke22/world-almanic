import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const client = path.join(dist, "client");

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "server"), { recursive: true });
await mkdir(client, { recursive: true });

for (const item of ["index.html", "assets", "data", "emoji", "src"]) {
  await cp(path.join(root, item), path.join(client, item), { recursive: true });
}

const mapboxToken = process.env.WORLD_ALMANAC_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN || "";
if (mapboxToken.trim()) {
  await writeFile(
    path.join(client, "config.local.js"),
    `window.WORLD_ALMANAC_MAPBOX_TOKEN = ${JSON.stringify(mapboxToken.trim())};\n`
  );
}

await cp(path.join(client, "index.html"), path.join(client, "404.html"));
await writeFile(path.join(client, ".nojekyll"), "");

await cp(path.join(root, ".openai"), path.join(dist, ".openai"), { recursive: true });

await writeFile(
  path.join(dist, "server", "index.js"),
  `async function fetchAsset(request, env) {
  const url = new URL(request.url);
  const assetRequestUrl = new URL(request.url);

  if (url.pathname === "/" || url.pathname.endsWith("/")) {
    assetRequestUrl.pathname = "/index.html";
  }

  const assetResponse = await env.ASSETS.fetch(new Request(assetRequestUrl, request));
  if (assetResponse.status !== 404 || !["GET", "HEAD"].includes(request.method)) {
    return assetResponse;
  }

  const indexUrl = new URL(request.url);
  indexUrl.pathname = "/index.html";
  return env.ASSETS.fetch(new Request(indexUrl, request));
}

export default {
  fetch(request, env) {
    if (!env || !env.ASSETS) {
      return new Response("ASSETS binding is not configured", { status: 500 });
    }

    return fetchAsset(request, env);
  }
};
`
);
