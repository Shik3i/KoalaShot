import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { releaseVersion } from "./release-preflight.mjs";

const routes = ["/", "/help/", "/privacy/", "/legal/", "/version.json", "/__koalashot_missing__/nested/page"];
export async function verifyDeployment(base, version, request = fetch) {
  releaseVersion(`v${version}`);
  const origin = new URL(base);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Expected an HTTPS origin without credentials or a path");
  const failures = [];
  for (const path of routes) {
    try {
      const response = await request(new URL(path, origin), { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
      const missing = path.startsWith("/__koalashot_missing__/");
      if (response.status !== (missing ? 404 : 200)) throw new Error(`HTTP ${response.status}; expected ${missing ? 404 : 200}`);
      const required = {
        "content-security-policy": ["default-src 'self'", "script-src 'self'", "frame-ancestors 'none'", "object-src 'none'"],
        "strict-transport-security": ["max-age=31536000"],
        "x-content-type-options": ["nosniff"],
        "referrer-policy": ["strict-origin-when-cross-origin"],
        "permissions-policy": ["camera=()", "microphone=()", "geolocation=()"],
        "content-type": [path === "/version.json" ? "application/json" : "text/html"],
      };
      for (const [name, values] of Object.entries(required)) if (values.some(value => !response.headers.get(name)?.includes(value))) throw new Error(`Missing or unexpected ${name}`);
      if (path === "/version.json") {
        if (!response.headers.get("cache-control")?.includes("no-store")) throw new Error("version.json must use Cache-Control: no-store");
        if ((await response.json()).version !== version) throw new Error(`Deployed version differs from ${version}`);
      } else {
        const html = await response.text();
        if (!html.includes("KoalaShot") || !html.includes('href="https://koalastuff.net/legal"')) throw new Error("Missing product or central legal link");
        if (missing && (!html.includes("Page not found") || !html.includes('href="/help/"'))) throw new Error("Missing usable custom 404 page");
        if (!missing && !html.includes(`>v${version}</span>`)) throw new Error("HTML version differs from release (stale or unbuilt page)");
      }
    } catch (error) {
      failures.push(`${path}: ${error.message}${error.cause?.message ? ` (${error.cause.message})` : ""}`);
    }
  }
  if (failures.length) throw new Error(`Deployment verification failed:\n${failures.join("\n")}`);
  return `Verified ${origin.origin}: HTTPS, version ${version}, ${routes.length} routes and response headers. No deployment performed.`;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(await verifyDeployment(process.argv[2] || "https://shot.koalastuff.net", process.argv[3])); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
