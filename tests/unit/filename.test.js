import test from "node:test";
import assert from "node:assert/strict";
import { formatLocalTimestamp, getSafeHostname, makeFilename } from "../../extension/common/filename.js";

test("formats local timestamps with filesystem-safe separators", () => {
  const date = new Date(2026, 7, 12, 9, 42, 18);
  assert.equal(formatLocalTimestamp(date), "2026-08-12_09-42-18");
});

test("sanitizes hostnames and falls back to page", () => {
  assert.equal(getSafeHostname("https://example.com/article"), "example.com");
  assert.equal(getSafeHostname("not a URL"), "page");
  assert.equal(makeFilename("https://example.com/article", new Date(2026, 7, 12, 9, 42, 18)), "KoalaShot_example.com_2026-08-12_09-42-18.png");
});
