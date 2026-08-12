export const ANNOTATION_TYPES = Object.freeze([
  "pen",
  "highlighter",
  "arrow",
  "line",
  "rectangle",
  "text",
  "redact",
]);

export const MAX_ANNOTATIONS = 5000;
export const MAX_POINTS = 2000;
export const MAX_TEXT_LENGTH = 10_000;
const ID_PATTERN = /^[A-Za-z0-9-]{8,128}$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function isFiniteNumber(value) {
  return Number.isFinite(value) && Math.abs(value) <= 1_000_000_000;
}

function assertFiniteNumber(value, field) {
  if (!isFiniteNumber(value)) {
    throw new Error(`Invalid annotation ${field}.`);
  }
}

function assertColor(value, field = "color") {
  if (typeof value !== "string" || !COLOR_PATTERN.test(value)) {
    throw new Error(`Invalid annotation ${field}.`);
  }
}

function assertStrokeWidth(value) {
  if (!Number.isFinite(value) || value < 1 || value > 200) {
    throw new Error("Invalid annotation stroke width.");
  }
}

function assertPoint(point) {
  if (!point || typeof point !== "object") {
    throw new Error("Invalid freehand point.");
  }
  assertFiniteNumber(point.x, "point");
  assertFiniteNumber(point.y, "point");
}

function assertPoints(points) {
  if (!Array.isArray(points) || points.length < 2 || points.length > MAX_POINTS) {
    throw new Error("Invalid freehand points.");
  }
  points.forEach(assertPoint);
}

function assertId(id) {
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    throw new Error("Invalid annotation ID.");
  }
}

export function validateAnnotation(annotation) {
  if (!annotation || typeof annotation !== "object" || Array.isArray(annotation)) {
    throw new Error("Invalid annotation object.");
  }
  assertId(annotation.id);
  if (!ANNOTATION_TYPES.includes(annotation.type)) {
    throw new Error("Invalid annotation type.");
  }

  if (annotation.type === "pen" || annotation.type === "highlighter") {
    assertPoints(annotation.points);
    assertColor(annotation.color);
    assertStrokeWidth(annotation.strokeWidth);
    if (annotation.type === "highlighter" && (!Number.isFinite(annotation.opacity) || annotation.opacity <= 0 || annotation.opacity > 1)) {
      throw new Error("Invalid highlighter opacity.");
    }
  } else if (["arrow", "line"].includes(annotation.type)) {
    ["startX", "startY", "endX", "endY"].forEach((field) => assertFiniteNumber(annotation[field], field));
    assertColor(annotation.color);
    assertStrokeWidth(annotation.strokeWidth);
  } else if (["rectangle", "redact"].includes(annotation.type)) {
    ["x", "y", "width", "height"].forEach((field) => assertFiniteNumber(annotation[field], field));
    if (annotation.width <= 0 || annotation.height <= 0) {
      throw new Error("Invalid annotation bounds.");
    }
    assertColor(annotation.color);
    if (annotation.type === "rectangle") {
      assertStrokeWidth(annotation.strokeWidth);
    }
  } else if (annotation.type === "text") {
    assertFiniteNumber(annotation.x, "x");
    assertFiniteNumber(annotation.y, "y");
    if (typeof annotation.text !== "string" || annotation.text.length > MAX_TEXT_LENGTH || !annotation.text.trim()) {
      throw new Error("Invalid annotation text.");
    }
    assertColor(annotation.color);
    if (!Number.isFinite(annotation.fontSize) || annotation.fontSize < 8 || annotation.fontSize > 300) {
      throw new Error("Invalid annotation font size.");
    }
  }
  return true;
}

export function validateAnnotations(annotations) {
  if (!Array.isArray(annotations) || annotations.length > MAX_ANNOTATIONS) {
    throw new Error("Invalid annotation draft.");
  }
  annotations.forEach(validateAnnotation);
  return true;
}

export function tryValidateAnnotations(annotations) {
  try {
    validateAnnotations(annotations);
    return { valid: true, annotations: cloneAnnotations(annotations), error: "" };
  } catch (error) {
    return {
      valid: false,
      annotations: [],
      error: error instanceof Error ? error.message : "Invalid annotation draft.",
    };
  }
}

export function cloneAnnotation(annotation) {
  return JSON.parse(JSON.stringify(annotation));
}

export function cloneAnnotations(annotations) {
  return annotations.map(cloneAnnotation);
}

export function makeAnnotationId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Secure annotation ID generation is unavailable.");
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createAnnotation(type, geometry, styles = {}) {
  if (!ANNOTATION_TYPES.includes(type)) {
    throw new Error("Invalid annotation type.");
  }
  const base = { id: makeAnnotationId(), type, ...geometry, ...styles };
  validateAnnotation(base);
  return base;
}

export function moveAnnotation(annotation, deltaX, deltaY) {
  assertFiniteNumber(deltaX, "deltaX");
  assertFiniteNumber(deltaY, "deltaY");
  const moved = cloneAnnotation(annotation);
  if (moved.type === "pen" || moved.type === "highlighter") {
    moved.points = moved.points.map((point) => ({ x: point.x + deltaX, y: point.y + deltaY }));
  } else if (["arrow", "line"].includes(moved.type)) {
    moved.startX += deltaX;
    moved.startY += deltaY;
    moved.endX += deltaX;
    moved.endY += deltaY;
  } else {
    moved.x += deltaX;
    moved.y += deltaY;
  }
  validateAnnotation(moved);
  return moved;
}

export function updateAnnotationStyle(annotation, changes) {
  const updated = cloneAnnotation(annotation);
  if (changes.color !== undefined) {
    assertColor(changes.color);
    updated.color = changes.color;
  }
  if (changes.strokeWidth !== undefined && updated.type !== "text" && updated.type !== "redact") {
    assertStrokeWidth(changes.strokeWidth);
    updated.strokeWidth = changes.strokeWidth;
  }
  if (changes.fontSize !== undefined && updated.type === "text") {
    if (!Number.isFinite(changes.fontSize) || changes.fontSize < 8 || changes.fontSize > 300) {
      throw new Error("Invalid annotation font size.");
    }
    updated.fontSize = changes.fontSize;
  }
  validateAnnotation(updated);
  return updated;
}
