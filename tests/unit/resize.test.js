import test from "node:test";
import assert from "node:assert/strict";
import { resizeAnnotation, resizeHandles } from "../../extension/editor/resize.js";

test("shape resizing preserves annotation identity, style and the opposite corner", () => {
  for (const type of ["rectangle", "ellipse", "redact", "pixelate", "blur"]) {
    const original = { id: "resize-test-0001", type, x: 10, y: 20, width: 100, height: 80, color: "#111111", strokeWidth: 5 };
    const result = resizeAnnotation(original, "se", { x: 150, y: 200 });
    assert.deepEqual(result, { ...original, width: 140, height: 180 });
    assert.deepEqual(resizeAnnotation(original, "nw", { x: 0, y: 5 }), { ...original, x: 0, y: 5, width: 110, height: 95 });
    assert.equal(original.width, 100);
    assert.equal(resizeHandles(original).length, 4);
    assert.equal(resizeAnnotation(original, "se", { x: -50, y: -80 }).width, 2);
  }
  assert.deepEqual(resizeHandles({ type: "text" }), []);
  assert.throws(() => resizeAnnotation({ type: "text" }, "nw", { x: 0, y: 0 }));
});
