import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("packaged landing links survive metadata-fetch failure and partial store launch", () => {
  const result = spawnSync(process.execPath, ["scripts/run-python.cjs", "tests/landing_build_test.py"], { cwd: fileURLToPath(new URL("../..", import.meta.url)), encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("release checksums reject wrong paths, modified downloads and unsafe archives", () => {
  const result = spawnSync(process.execPath, ["scripts/run-python.cjs", "tests/release_assets_test.py"], { cwd: fileURLToPath(new URL("../..", import.meta.url)), encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
