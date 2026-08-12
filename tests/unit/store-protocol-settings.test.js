import test from "node:test";
import assert from "node:assert/strict";
import { TEMP_CAPTURE_TTL_MS } from "../../extension/common/constants.js";
import { isCaptureExpired } from "../../extension/common/capture-store.js";
import { isValidCaptureMessage, isValidSessionId } from "../../extension/common/protocol.js";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../extension/common/settings.js";

test("expires temporary records at the documented TTL", () => {
  const now = 10_000;
  assert.equal(isCaptureExpired({ createdAt: now - TEMP_CAPTURE_TTL_MS }, now), true);
  assert.equal(isCaptureExpired({ createdAt: now - TEMP_CAPTURE_TTL_MS + 1 }, now), false);
});

test("uses a conservative settings default", () => {
  assert.deepEqual(DEFAULT_SETTINGS, { openEditorAfterCapture: false });
  assert.deepEqual(normalizeSettings({ openEditorAfterCapture: 1 }), { openEditorAfterCapture: true });
  assert.deepEqual(normalizeSettings(), { openEditorAfterCapture: false });
});

test("validates capture sessions and rejects stale or malformed messages", () => {
  const sessionId = "12345678-1234-4234-8234-123456789012";
  assert.equal(isValidSessionId(sessionId), true);
  assert.equal(isValidCaptureMessage({ sessionId, type: "start" }), true);
  assert.equal(isValidCaptureMessage({ sessionId, type: "scroll", requestedY: 20, sectionIndex: 0, sectionCount: 2, isFinal: false }), true);
  assert.equal(isValidCaptureMessage({ sessionId: "old", type: "start" }), false);
  assert.equal(isValidCaptureMessage({ sessionId, type: "scroll", requestedY: -1, sectionIndex: 0, sectionCount: 2, isFinal: false }), false);
});
