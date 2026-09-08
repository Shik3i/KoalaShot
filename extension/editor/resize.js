import { cloneAnnotation, validateAnnotation } from "./annotation-model.js";

export function resizeHandles(annotation) {
  if (!annotation || !["rectangle", "ellipse", "redact", "pixelate", "blur"].includes(annotation.type)) return [];
  const { x, y, width, height } = annotation;
  return [{ name: "nw", x, y }, { name: "ne", x: x + width, y },
    { name: "sw", x, y: y + height }, { name: "se", x: x + width, y: y + height }];
}

export function resizeAnnotation(annotation, handle, point) {
  if (!resizeHandles(annotation).some(item => item.name === handle) || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) throw new Error("Invalid annotation resize.");
  const anchorX = handle.endsWith("w") ? annotation.x + annotation.width : annotation.x;
  const anchorY = handle.startsWith("n") ? annotation.y + annotation.height : annotation.y;
  const x = handle.endsWith("w") ? Math.min(point.x, anchorX - 2) : Math.max(point.x, anchorX + 2);
  const y = handle.startsWith("n") ? Math.min(point.y, anchorY - 2) : Math.max(point.y, anchorY + 2);
  const resized = { ...cloneAnnotation(annotation), x: Math.min(x, anchorX), y: Math.min(y, anchorY), width: Math.abs(x - anchorX), height: Math.abs(y - anchorY) };
  validateAnnotation(resized);
  return resized;
}
