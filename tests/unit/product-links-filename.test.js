import test from "node:test";
import assert from "node:assert/strict";
import { validStoreUrl, reviewUrl } from "../../extension/common/product-links.js";
import { normalizePngFilename } from "../../extension/common/filename.js";

test("review links use only valid official listings for the requested browser", () => {
  const chrome = "https://chromewebstore.google.com/detail/koalashot/" + "a".repeat(32);
  const firefox = "https://addons.mozilla.org/en-US/firefox/addon/koalashot/";
  assert.equal(reviewUrl(chrome + "?utm=test#ignored", "chrome"), chrome + "/reviews");
  assert.equal(reviewUrl(firefox, "firefox"), firefox + "reviews/");
  assert.equal(reviewUrl(null, "chrome"), null);
  assert.equal(validStoreUrl(chrome, "firefox"), null);
  assert.equal(validStoreUrl(firefox, "chrome"), null);
  for (const url of ["javascript:alert(1)", chrome.replace("https:", "http:"), chrome.replace(".com", ".com.evil.test"), chrome.replace("https://", "https://user@"), chrome.replace(".com/", ".com:8443/"), chrome.replace("a".repeat(32), "bad-id"), chrome + "/reviews"]) {
    assert.equal(validStoreUrl(url, "chrome"), null, url);
  }
});

test("custom PNG names survive filesystem restrictions and empty input", () => {
  assert.equal(normalizePngFilename("Report: screenshot.PNG"), "Report_ screenshot.png");
  assert.equal(normalizePngFilename("CON"), "_CON.png");
  assert.equal(normalizePngFilename("aux.txt"), "_aux.txt.png");
  for (const value of ["", "   ", "...", ".png"]) assert.equal(normalizePngFilename(value, "fallback.png"), "fallback.png");
  assert.ok(normalizePngFilename("x".repeat(300)).length <= 128);
});
