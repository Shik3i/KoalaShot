# Phase 2 editor specification and implementation contract

Phase 2 is implemented in the local editor page. This document is the durable contract for its non-destructive model and the boundary for future editor work. The popup capture flow remains unchanged: the original is copied or saved before optional editor handoff.

Implemented tools: Select, Pan, Freehand Pen, Highlighter, Arrow, Line, Rectangle, Text, secure opaque Redact, Undo, Redo, Delete selected annotation, Clear all annotations, Zoom in/out, Fit to width, Actual size, Copy edited, Save edited PNG, and Close and discard.

Future tools outside this phase: Crop, Ellipse, Pixelation, Blur, numbered markers, resize handles, configurable arrowheads, text outlines, and image insertion.

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

The Phase 2 toolbar implements Select, Freehand pen, Highlighter, Arrow, Line, Rectangle, Text, secure redaction, Undo, Redo, Zoom, Pan, Delete selected annotation, Clear all, Copy edited PNG, Save edited PNG, and keyboard shortcuts. These controls are functional; the UI does not expose placeholder future tools.

## Rendering

Use Canvas 2D and vanilla JavaScript only. Keep the original image as an `<img>` and maintain an annotation object list. The editor uses a viewport-sized overlay canvas for visible interaction; it does not keep a permanent full-resolution display canvas. Render the edited result only when an export is requested. Copy and Save both call `renderEditorResultBlob()` so they cannot diverge. The temporary export canvas uses original-image dimensions and preserves full output resolution.

## History

Use command- or object-based undo/redo. Each command records the minimum before/after object state or an insertion/deletion/move operation. Do not store a full-image snapshot for every history entry. New edits clear the redo stack. Selection state is UI state and need not be part of the document history.

## Selection and hit-testing

Hit-test in original-image coordinates after inverting the display transform. Use geometry-specific tolerances scaled by zoom: distance to line segments for pen/line/arrow, bounds for rectangles/text, and stroke path proximity for freehand. A selected object gets a non-exported overlay with handles. Moving updates only the object coordinates; Delete removes the selected object through a history command.

## Redaction security

Opaque redaction is security-sensitive and distinct from cosmetic blur or pixelation. A redaction object must paint an opaque solid region into the final export, cover every pixel of its bounds, and never preserve the original pixels in the exported PNG. The UI must not call blur or pixelation “secure redaction.” Export tests must reopen the PNG and verify that redacted regions contain only the opaque redaction color within the chosen tolerance.

## Draft state

The existing temporary IndexedDB capture record contains a validated `annotations` array. Editor changes are debounced into the same record; no screenshot Base64 or browser sync storage is introduced. Reload restores the draft, while expiry and Close and discard remove the image and annotations together.

## Memory and export

Avoid full-resolution canvas copies during ordinary editing. If export requires a second canvas for compositing, apply the existing conservative memory checks before allocation and release intermediate bitmaps and object URLs. The final-render path must preserve the original dimensions, return one PNG Blob, and clear large references after completion.
