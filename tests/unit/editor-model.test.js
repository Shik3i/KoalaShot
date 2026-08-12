import test from "node:test";
import assert from "node:assert/strict";
import {
  createAnnotation,
  moveAnnotation,
  tryValidateAnnotations,
  validateAnnotation,
} from "../../extension/editor/annotation-model.js";
import {
  annotationBounds,
  arrowheadGeometry,
  distanceToSegment,
  hitTestAnnotation,
  imagePointFromClient,
  normalizeRectangle,
  reducePoints,
  textBounds,
} from "../../extension/editor/geometry.js";
import { AnnotationHistory } from "../../extension/editor/history.js";

function fixedId() {
  return "12345678-1234-4234-8234-123456789012";
}

test("validates explicit annotation schemas and rejects arbitrary objects", () => {
  const line = { id: fixedId(), type: "line", startX: 1, startY: 2, endX: 50, endY: 60, color: "#287a4a", strokeWidth: 6 };
  assert.equal(validateAnnotation(line), true);
  assert.throws(() => validateAnnotation({ ...line, type: "unknown" }));
  assert.equal(tryValidateAnnotations([line, { nope: true }]).valid, false);
});

test("moves annotations without changing their logical coordinate system", () => {
  const arrow = createAnnotation("arrow", { startX: 10, startY: 20, endX: 40, endY: 50 }, { color: "#e53935", strokeWidth: 4 });
  const moved = moveAnnotation(arrow, 100, -5);
  assert.deepEqual([moved.startX, moved.startY, moved.endX, moved.endY], [110, 15, 140, 45]);
});

test("normalizes rectangles and reduces redundant pen points", () => {
  assert.deepEqual(normalizeRectangle({ x: 80, y: 70 }, { x: 10, y: 20 }), { x: 10, y: 20, width: 70, height: 50 });
  const points = Array.from({ length: 100 }, (_, index) => ({ x: index * 0.1, y: index * 0.1 }));
  assert.ok(reducePoints(points, 1).length < points.length);
  assert.ok(reducePoints(points, 0, 12).length <= 12);
});

test("centralizes screen-to-image coordinates and keeps zoom out of the model", () => {
  assert.deepEqual(imagePointFromClient({ clientX: 250, clientY: 180, viewportRect: { left: 50, top: 30 }, scrollLeft: 0, scrollTop: 0, zoom: 2 }), { x: 100, y: 75 });
});

test("provides shared arrow geometry and zoom-aware hit testing", () => {
  const head = arrowheadGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, 6);
  assert.equal(head.tip.x, 100);
  const line = createAnnotation("line", { startX: 0, startY: 0, endX: 100, endY: 0 }, { color: "#111111", strokeWidth: 4 });
  assert.equal(hitTestAnnotation(line, { x: 50, y: 4 }, 2), true);
  assert.equal(distanceToSegment({ x: 50, y: 20 }, { x: 0, y: 0 }, { x: 100, y: 0 }), 20);
});

test("calculates text bounds and annotation bounds", () => {
  const text = createAnnotation("text", { x: 20, y: 30 }, { text: "one\ntwo", color: "#111111", fontSize: 20 });
  assert.equal(textBounds(text).height, 50);
  assert.ok(annotationBounds(text).width > 0);
});

test("history groups changes, bounds entries, and invalidates redo", () => {
  const history = new AnnotationHistory([], { limit: 2 });
  history.apply("one", [{ id: fixedId(), type: "redact", x: 0, y: 0, width: 10, height: 10, color: "#111111" }]);
  history.apply("two", []);
  assert.equal(history.canUndo, true);
  history.undo();
  assert.equal(history.canRedo, true);
  history.apply("three", []);
  assert.equal(history.canRedo, false);
});

