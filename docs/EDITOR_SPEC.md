# Phase 2 editor specification

Phase 1 provides an editor page, local temporary capture loading, and one export abstraction. Phase 2 extends that foundation without replacing the handoff contract.

## Model

```text
Immutable original PNG
+
Vector annotation objects
=
Exported PNG
```

The original PNG remains immutable. Annotation geometry is stored in original-image pixels, never display pixels. Display zoom changes only the view transform; it does not rewrite annotation coordinates. A representative object is:

```js
{
  id: "annotation-id",
  type: "arrow",
  startX: 420,
  startY: 180,
  endX: 610,
  endY: 290,
  color: "#e53935",
  width: 6
}
```

## Tools and actions

The direct Phase 2 toolbar adds Select, Freehand pen, Highlighter, Arrow, Line, Rectangle, Text, secure redaction, Undo, Redo, Zoom, Pan, and Delete selected annotation. Copy edited PNG and Save edited PNG use the same shared final-render path. Later additions may include Crop, Ellipse, Pixelation, numbered markers, resize handles, configurable arrowheads, text outlines, and keyboard shortcuts.

## Rendering

Use Canvas 2D and vanilla JavaScript only. Keep the original image as an `<img>`/decoded source and maintain an annotation object list. Render the edited result only when an export is requested or when a visible preview must be refreshed. Copy and Save must both call `renderEditorResultBlob()` so they cannot diverge. The export canvas must use original-image dimensions and preserve full output resolution.

## History

Use command- or object-based undo/redo. Each command records the minimum before/after object state or an insertion/deletion/move operation. Do not store a full-image snapshot for every history entry. New edits clear the redo stack. Selection state is UI state and need not be part of the document history.

## Selection and hit-testing

Hit-test in original-image coordinates after inverting the display transform. Use geometry-specific tolerances scaled by zoom: distance to line segments for pen/line/arrow, bounds for rectangles/text, and stroke path proximity for freehand. A selected object gets a non-exported overlay with handles. Moving updates only the object coordinates; Delete removes the selected object through a history command.

## Redaction security

Opaque redaction is security-sensitive and distinct from cosmetic blur or pixelation. A redaction object must paint an opaque solid region into the final export, cover every pixel of its bounds, and never preserve the original pixels in the exported PNG. The UI must not call blur or pixelation “secure redaction.” Export tests must reopen the PNG and verify that redacted regions contain only the opaque redaction color within the chosen tolerance.

## Memory and export

Avoid full-resolution canvas copies during ordinary editing. If export requires a second canvas for compositing, apply the existing conservative memory checks before allocation and release intermediate bitmaps and object URLs. The final-render path must preserve the original dimensions, return one PNG Blob, and clear large references after completion.
