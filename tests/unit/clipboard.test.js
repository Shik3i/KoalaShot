import test from "node:test";
import assert from "node:assert/strict";
import { selectClipboardMethod } from "../../extension/common/clipboard.js";

test("selects Firefox setImageData when available", () => {
  assert.equal(selectClipboardMethod({ hasFirefoxSetImageData: true, hasClipboardItem: true, hasNavigatorClipboardWrite: true }), "firefox-set-image-data");
});

test("selects the standard ClipboardItem path for Chromium capabilities", () => {
  assert.equal(selectClipboardMethod({ hasFirefoxSetImageData: false, hasClipboardItem: true, hasNavigatorClipboardWrite: true }), "clipboard-item");
});

test("reports unsupported image clipboard capabilities", () => {
  assert.equal(selectClipboardMethod({ hasFirefoxSetImageData: false, hasClipboardItem: false, hasNavigatorClipboardWrite: false }), "unsupported");
});
