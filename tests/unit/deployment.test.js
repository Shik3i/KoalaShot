import test from "node:test";
import assert from "node:assert/strict";
import { verifyDeployment } from "../../scripts/verify-deployment.mjs";

function response(url, changes = {}) {
  const json = url.pathname === "/version.json";
  const values = {
    "content-security-policy": "default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "content-type": json ? "application/json" : "text/html",
    "cache-control": "no-store",
  };
  return { status: url.pathname.startsWith("/__koalashot_missing__/") ? 404 : 200, headers: { get: key => values[key] }, json: async () => ({ version: "1.2.3" }), text: async () => 'KoalaShot >v1.2.3</span> <a href="https://koalastuff.net/legal">Legal</a> Page not found <a href="/help/">Help</a>', ...changes };
}
test("manual deployment probe verifies routes, headers, version and real 404 status", async () => {
  const visited = [];
  await verifyDeployment("https://example.test", "1.2.3", async url => { visited.push(url.pathname); return response(url); });
  assert.equal(visited.length, 6);
  for (const changes of [{ status: 200 }, { headers: { get: () => null } }, { json: async () => ({ version: "0.0.1" }) }, { text: async () => "Other product" }]) {
    await assert.rejects(verifyDeployment("https://example.test", "1.2.3", async url => response(url, changes)), /Deployment verification failed/);
  }
  await assert.rejects(verifyDeployment("https://example.test", "1.2.3", async () => { throw new Error("TLS failure"); }), /TLS failure/);
  await assert.rejects(verifyDeployment("http://example.test", "1.2.3"), /HTTPS origin/);
});
