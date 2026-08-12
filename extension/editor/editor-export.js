import { MAX_CANVAS_HEIGHT, MAX_CANVAS_PIXELS, MAX_CANVAS_WIDTH, MAX_RAW_CANVAS_BYTES } from "../common/constants.js";
import { tryValidateAnnotations, validateAnnotation } from "./annotation-model.js";
import { drawAnnotation } from "./geometry.js";

async function decodeOriginal(blob) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(blob);
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function releaseImage(image) {
  image?.close?.();
}

export async function renderEditorResultBlob(capture, annotations = capture?.annotations || []) {
  if (!(capture?.blob instanceof Blob) || capture.blob.type !== "image/png") {
    throw new Error("The editor capture is unavailable.");
  }
  if (!Number.isInteger(capture.width) || !Number.isInteger(capture.height) || capture.width <= 0 || capture.height <= 0) {
    throw new Error("The screenshot dimensions are invalid.");
  }
  const validation = tryValidateAnnotations(annotations);
  if (!validation.valid) {
    throw new Error("The annotation draft is invalid.");
  }
  const rawBytes = capture.width * capture.height * 4;
  if (capture.width > MAX_CANVAS_WIDTH || capture.height > MAX_CANVAS_HEIGHT
    || capture.width * capture.height > MAX_CANVAS_PIXELS || rawBytes * 2 > MAX_RAW_CANVAS_BYTES) {
    throw new Error("This page is too large to export as one PNG at the current resolution.");
  }
  const original = await decodeOriginal(capture.blob);
  let canvas = null;
  try {
    canvas = document.createElement("canvas");
    canvas.width = capture.width;
    canvas.height = capture.height;
    if (canvas.width !== capture.width || canvas.height !== capture.height) {
      throw new Error("This page is too large to export as one PNG at the current resolution.");
    }
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("The browser could not allocate an export canvas.");
    }
    context.drawImage(original, 0, 0, capture.width, capture.height);
    validation.annotations.forEach((annotation) => {
      validateAnnotation(annotation);
      drawAnnotation(context, annotation);
    });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      throw new Error("The browser could not encode the edited PNG.");
    }
    return blob;
  } finally {
    releaseImage(original);
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }
}
