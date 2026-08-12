import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateSectionPlacement,
  cssToBitmapPixel,
  estimateRawMemory,
  generateCapturePositions,
  getBoundedDocumentHeight,
} from "../../extension/popup/stitcher.js";

test("generates deterministic positions and ends at the actual maximum scroll", () => {
  assert.deepEqual(generateCapturePositions(2000, 600), [0, 600, 1200, 1400]);
  assert.deepEqual(generateCapturePositions(400, 600), [0]);
});

test("centralizes CSS-pixel to bitmap-pixel rounding", () => {
  assert.equal(cssToBitmapPixel(10.5, 2), 21);
  assert.equal(cssToBitmapPixel(10.25, 1.5), 15);
});

test("crops the overlapping top of the final section", () => {
  const placement = calculateSectionPlacement({
    scrollY: 500,
    bitmapHeight: 600,
    scaleY: 1,
    previousBottom: 600,
    outputHeight: 1100,
  });
  assert.equal(placement.sourceStart, 100);
  assert.equal(placement.destinationStart, 600);
  assert.equal(placement.availableHeight, 500);
  assert.equal(placement.nextBottom, 1100);
});

test("bounds dynamic document growth", () => {
  assert.deepEqual(getBoundedDocumentHeight(1000, 1100), { maximumAllowed: 1250, height: 1100, exceeded: false });
  assert.deepEqual(getBoundedDocumentHeight(1000, 1400), { maximumAllowed: 1250, height: 1250, exceeded: true });
});

test("estimates four bytes per output pixel", () => {
  assert.equal(estimateRawMemory(1920, 1000), 7_680_000);
});
