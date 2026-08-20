import test from "node:test";
import assert from "node:assert/strict";
import { selectClipboardMethod } from "../../extension/common/clipboard.js";

test("selects Firefox setImageData when available", () => {
  assert.equal(selectClipboardMethod({ isFirefox: true, hasFirefoxSetImageData: true, hasClipboardItem: true, hasNavigatorClipboardWrite: true }), "firefox-set-image-data");
});

test("selects the standard ClipboardItem path for Chromium capabilities", () => {
  assert.equal(selectClipboardMethod({ isFirefox: false, hasFirefoxSetImageData: false, hasClipboardItem: true, hasNavigatorClipboardWrite: true }), "clipboard-item");
});

test("does not use the Chrome Apps-only setImageData API in Chromium extensions", () => {
  assert.equal(selectClipboardMethod({ isFirefox: false, hasFirefoxSetImageData: true, hasClipboardItem: true, hasNavigatorClipboardWrite: true }), "clipboard-item");
});

test("reports unsupported image clipboard capabilities", () => {
  assert.equal(selectClipboardMethod({ isFirefox: false, hasFirefoxSetImageData: false, hasClipboardItem: false, hasNavigatorClipboardWrite: false }), "unsupported");
});
