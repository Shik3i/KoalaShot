import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { releaseVersion, run } from "./release-preflight.mjs";

export function validateDraft(release, tag, names) {
  if (!release.draft || release.prerelease || release.tag_name !== tag) throw new Error("Expected matching stable draft release");
  if (JSON.stringify(release.assets.map(a => a.name).sort()) !== JSON.stringify([...names, "SHA256SUMS"].sort())) throw new Error("Unexpected or missing release assets");
  if (release.assets.some(a => a.state !== "uploaded" || !a.size)) throw new Error("Incomplete release asset upload");
}
export function attestationArgs(path, repo, tag, commit) {
  return ["attestation", "verify", path, "--repo", repo, "--signer-workflow", `${repo}/.github/workflows/release.yml`, "--source-ref", `refs/tags/${tag}`, "--source-digest", commit, "--deny-self-hosted-runners"];
}
export function verifyRelease(tag, commit, repo, expected, execute = run) {
  const version = releaseVersion(tag);
  if (!/^[a-f0-9]{40}$/.test(commit) || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("Invalid release identity");
  const names = ["chrome", "firefox", "landing"].map(target => `koalashot-${target}-${version}.zip`);
  const readRelease = () => JSON.parse(execute("gh", ["api", `repos/${repo}/releases/tags/${tag}`]));
  const release = readRelease();
  validateDraft(release, tag, names);
  const directory = mkdtempSync(join(tmpdir(), "koalashot-release-"));
  try {
    execute("gh", ["release", "download", tag, "--repo", repo, "--dir", directory]);
    execute(process.execPath, ["scripts/run-python.cjs", "scripts/release_assets.py", directory, version, "--expected", expected]);
    for (const name of names) execute("gh", attestationArgs(join(directory, name), repo, tag, commit));
    const ref = JSON.parse(execute("gh", ["api", `repos/${repo}/git/ref/tags/${tag}`])).object;
    if (ref.type !== "tag" || !/^[a-f0-9]{40}$/.test(ref.sha)) throw new Error("Remote release tag is no longer annotated");
    const target = JSON.parse(execute("gh", ["api", `repos/${repo}/git/tags/${ref.sha}`])).object;
    if (target.type !== "commit" || target.sha !== commit) throw new Error("Remote release tag no longer points to the verified commit");
    const current = readRelease();
    validateDraft(current, tag, names);
    const identity = r => JSON.stringify([r.id, r.assets.map(a => [a.id, a.name, a.size, a.updated_at]).sort((a, b) => a[0] - b[0])]);
    if (identity(current) !== identity(release)) throw new Error("Release assets changed during verification");
    // Publish only this verified draft ID, never a newly substituted release for the same tag.
    execute("gh", ["api", "--method", "PATCH", `repos/${repo}/releases/${release.id}`, "-F", "draft=false"]);
    const published = readRelease();
    if (published.draft || identity(published) !== identity(release)) throw new Error("Published release does not match verified draft");
    return `Verified and published ${tag}; website deployment remains manual.`;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(verifyRelease(process.env.GITHUB_REF_NAME, process.env.RELEASE_COMMIT, process.env.GITHUB_REPOSITORY, resolve("dist")));
