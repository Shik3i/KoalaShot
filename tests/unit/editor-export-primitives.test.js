import test from "node:test";
import assert from "node:assert/strict";
import { createAnnotation } from "../../extension/editor/annotation-model.js";
import { drawAnnotation } from "../../extension/editor/geometry.js";
import { makeEditedFilename } from "../../extension/common/filename.js";
import { renderEditorResultBlob } from "../../extension/editor/editor-export.js";

test("edited filenames retain the safe original base", () => {
  assert.equal(makeEditedFilename("KoalaShot_example.com_2026-08-12_09-42-18.png"), "KoalaShot_example.com_2026-08-12_09-42-18_edited.png");
});

test("secure redaction drawing always uses opaque fill", () => {
  const calls = [];
  const context = {
    save() {},
    restore() {},
    fillRect(...args) { calls.push({ alpha: this.globalAlpha, color: this.fillStyle, args }); },
    globalAlpha: 0.2,
    fillStyle: "#ffffff",
  };
  const redact = createAnnotation("redact", { x: 4, y: 8, width: 20, height: 10 }, { color: "#111111" });
  drawAnnotation(context, redact);
  assert.deepEqual(calls, [{ alpha: 1, color: "#111111", args: [4, 8, 20, 10] }]);
});

test("canonical export keeps redaction opaque", async () => {
  const originalDocument = globalThis.document;
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  const calls = [];
  const context = {
    save() {},
    restore() {},
    drawImage() {},
    fillRect(...args) { calls.push({ alpha: this.globalAlpha, color: this.fillStyle, args }); },
    globalAlpha: 0.15,
    fillStyle: "#ffffff",
  };
  const fakeCanvas = {
    width: 0,
    height: 0,
    getContext() { return context; },
    toBlob(callback) { callback(new Blob(["edited"], { type: "image/png" })); },
  };
  globalThis.createImageBitmap = async () => ({ close() {} });
  globalThis.document = { createElement() { return fakeCanvas; } };
  try {
    const redact = createAnnotation("redact", { x: 4, y: 8, width: 20, height: 10 }, { color: "#111111" });
    const blob = await renderEditorResultBlob({ blob: new Blob(["original"], { type: "image/png" }), width: 100, height: 100 }, [redact]);
    assert.equal(blob.type, "image/png");
    assert.deepEqual(calls, [{ alpha: 1, color: "#111111", args: [4, 8, 20, 10] }]);
  } finally {
    globalThis.document = originalDocument;
    globalThis.createImageBitmap = originalCreateImageBitmap;
  }
});
