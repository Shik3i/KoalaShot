import test from "node:test";
import assert from "node:assert/strict";
import { releaseVersion, validateSource, validateChecks, requiredChecks } from "../../scripts/release-preflight.mjs";
import { validateDraft, attestationArgs, verifyRelease } from "../../scripts/verify-release.mjs";
const commit = "a".repeat(40);
test("release rejects lightweight tags, wrong main, source mismatch and nonstable versions", () => {
  const good = { tag: "v1.2.3", type: "tag", commit, main: commit, version: "1.2.3" };
  validateSource(good);
  for (const change of [{ type: "commit" }, { main: "b".repeat(40) }, { version: "1.2.2" }]) assert.throws(() => validateSource({ ...good, ...change }));
  for (const tag of ["1.2.3", "v1.2.3-rc.1", "v01.2.3", "v1.2.3\n", undefined]) assert.throws(() => releaseVersion(tag));
});

test("draft publication happens only after downloaded bytes and all attestations pass, without asset races", () => {
  const names = ["chrome", "firefox", "landing"].map(target => `koalashot-${target}-1.2.3.zip`);
  for (const fault of [null, "download", "checksum", "attestation", "race", "tag-race"]) {
    let published = false;
    let reads = 0;
    let attestations = 0;
    const execute = (command, args) => {
      if (args[0] === "api" && args[1].includes("/git/ref/tags/")) return JSON.stringify({ object: { type: "tag", sha: "b".repeat(40) } });
      if (args[0] === "api" && args[1].includes("/git/tags/")) return JSON.stringify({ object: { type: "commit", sha: fault === "tag-race" ? "c".repeat(40) : commit } });
      if (args[0] === "api" && args[1].includes("/releases/tags/")) {
        reads++;
        return JSON.stringify({ id: 123, tag_name: "v1.2.3", draft: !published, prerelease: false, assets: [...names, "SHA256SUMS"].map((name, id) => ({ id: id + (fault === "race" && reads > 1 ? 100 : 0), name, state: "uploaded", size: 123, updated_at: "fixed" })) });
      }
      if (args[0] === "release" && fault === "download") throw new Error("download failed");
      if (command === process.execPath && fault === "checksum") throw new Error("checksum failed");
      if (args[0] === "attestation") { attestations++; if (fault === "attestation") throw new Error("attestation failed"); }
      if (args.includes("PATCH")) { assert.equal(attestations, 3); assert.ok(args.includes("repos/Shik3i/KoalaShot/releases/123")); published = true; }
      return "";
    };
    if (fault) assert.throws(() => verifyRelease("v1.2.3", commit, "Shik3i/KoalaShot", "unused", execute));
    else verifyRelease("v1.2.3", commit, "Shik3i/KoalaShot", "unused", execute);
    assert.equal(published, fault === null);
  }
});
test("required checks use latest trusted results for the exact commit", () => {
  const checks = requiredChecks.map((name, id) => ({ name, id, head_sha: commit, app: { slug: "github-actions" }, status: "completed", conclusion: "success" }));
  validateChecks(checks, commit);
  assert.throws(() => validateChecks(checks.slice(1), commit));
  assert.throws(() => validateChecks(checks, "b".repeat(40)));
  for (const conclusion of ["failure", "cancelled", "skipped", null]) assert.throws(() => validateChecks([...checks, { ...checks[0], id: 100, conclusion }], commit));
  assert.throws(() => validateChecks(checks.map(c => ({ ...c, status: "in_progress" })), commit));
  assert.throws(() => validateChecks(checks.map(c => ({ ...c, app: { slug: "other" } })), commit));
});
test("only complete matching drafts can be published; provenance binds workflow, tag and commit", () => {
  const names = ["chrome.zip", "firefox.zip", "landing.zip"];
  const draft = { tag_name: "v1.2.3", draft: true, prerelease: false, assets: [...names, "SHA256SUMS"].map(name => ({ name, size: 123, state: "uploaded" })) };
  validateDraft(draft, "v1.2.3", names);
  for (const change of [{ draft: false }, { prerelease: true }, { tag_name: "v1.2.4" }, { assets: draft.assets.slice(1) }, { assets: [...draft.assets, draft.assets[0]] }, { assets: draft.assets.map(a => ({ ...a, state: "starter" })) }]) assert.throws(() => validateDraft({ ...draft, ...change }, "v1.2.3", names));
  assert.deepEqual(attestationArgs("file.zip", "Shik3i/KoalaShot", "v1.2.3", commit), ["attestation", "verify", "file.zip", "--repo", "Shik3i/KoalaShot", "--signer-workflow", "Shik3i/KoalaShot/.github/workflows/release.yml", "--source-ref", "refs/tags/v1.2.3", "--source-digest", commit, "--deny-self-hosted-runners"]);
});
