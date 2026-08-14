import { MAX_CANVAS_HEIGHT, MAX_CANVAS_PIXELS, MAX_CANVAS_WIDTH, MAX_RAW_CANVAS_BYTES } from "../common/constants.js";
import { tryValidateAnnotations, tryValidateCrop, validateAnnotation } from "./annotation-model.js";
import { drawAnnotation } from "./geometry.js";

async function decodeOriginal(blob) {
  if (typeof createImageBitmap === "function") {
    return { image: await createImageBitmap(blob), url: null };
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("The original PNG could not be decoded."));
      image.src = url;
    });
    return { image, url };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function releaseImage(image) {
  image?.close?.();
}

function normalizeCropToImage(crop, width, height) {
  if (!crop) {
    return { x: 0, y: 0, width, height };
  }
  const left = Math.max(0, Math.min(width - 1, Math.round(crop.x)));
  const top = Math.max(0, Math.min(height - 1, Math.round(crop.y)));
  const right = Math.min(width, Math.max(left + 1, Math.round(crop.x + crop.width)));
  const bottom = Math.min(height, Math.max(top + 1, Math.round(crop.y + crop.height)));
  if (right <= left || bottom <= top) {
    throw new Error("The crop selection is outside the screenshot.");
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function sourceDimensions(image) {
  return {
    width: image?.naturalWidth || image?.width || 0,
    height: image?.naturalHeight || image?.height || 0,
  };
}

function effectSourceRect(annotation, image) {
  const dimensions = sourceDimensions(image);
  const left = Math.max(0, Math.min(dimensions.width - 1, Math.round(annotation.x)));
  const top = Math.max(0, Math.min(dimensions.height - 1, Math.round(annotation.y)));
  const right = Math.min(dimensions.width, Math.max(left + 1, Math.round(annotation.x + annotation.width)));
  const bottom = Math.min(dimensions.height, Math.max(top + 1, Math.round(annotation.y + annotation.height)));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function applyImageEffect(context, annotation, sourceImage) {
  if (!sourceImage || typeof document === "undefined") {
    drawAnnotation(context, annotation);
    return;
  }
  const source = effectSourceRect(annotation, sourceImage);
  if (source.width <= 0 || source.height <= 0) {
    return;
  }
  const maximumPreviewDimension = 640;
  const scale = annotation.type === "pixelate"
    ? Math.min(1 / 10, maximumPreviewDimension / Math.max(source.width, source.height))
    : Math.min(1, maximumPreviewDimension / Math.max(source.width, source.height));
  const preview = document.createElement("canvas");
  preview.width = Math.max(1, Math.ceil(source.width * scale));
  preview.height = Math.max(1, Math.ceil(source.height * scale));
  const previewContext = preview.getContext("2d");
  if (!previewContext) {
    throw new Error("The browser could not allocate the effect preview.");
  }
  try {
    previewContext.imageSmoothingEnabled = annotation.type !== "pixelate";
    if (annotation.type === "blur") {
      previewContext.filter = `blur(${Math.max(3, Math.min(18, 8 * scale))}px)`;
    }
    previewContext.drawImage(sourceImage, source.x, source.y, source.width, source.height, 0, 0, preview.width, preview.height);
    context.save();
    context.beginPath();
    context.rect(annotation.x, annotation.y, annotation.width, annotation.height);
    context.clip();
    context.imageSmoothingEnabled = annotation.type !== "pixelate";
    context.drawImage(preview, 0, 0, preview.width, preview.height, source.x, source.y, source.width, source.height);
    context.restore();
  } finally {
    preview.width = 1;
    preview.height = 1;
  }
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
  const cropValidation = tryValidateCrop(capture.crop || null);
  if (!cropValidation.valid) {
    throw new Error("The crop selection is invalid.");
  }
  const crop = normalizeCropToImage(cropValidation.crop, capture.width, capture.height);
  const rawBytes = capture.width * capture.height * 4;
  if (capture.width > MAX_CANVAS_WIDTH || capture.height > MAX_CANVAS_HEIGHT
    || capture.width * capture.height > MAX_CANVAS_PIXELS || rawBytes * 2 > MAX_RAW_CANVAS_BYTES) {
    throw new Error("This page is too large to export as one PNG at the current resolution.");
  }
  const existingImage = typeof document !== "undefined" && typeof document.querySelector === "function"
    ? document.querySelector("#capture-image")
    : null;
  const original = existingImage?.complete && existingImage.naturalWidth > 0
    ? { image: existingImage, url: null }
    : await decodeOriginal(capture.blob);
  let canvas = null;
  try {
    canvas = document.createElement("canvas");
    canvas.width = crop.width;
    canvas.height = crop.height;
    if (canvas.width !== crop.width || canvas.height !== crop.height) {
      throw new Error("This page is too large to export as one PNG at the current resolution.");
    }
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("The browser could not allocate an export canvas.");
    }
    context.drawImage(original.image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    context.save();
    context.translate?.(-crop.x, -crop.y);
    validation.annotations.forEach((annotation) => {
      validateAnnotation(annotation);
      if (annotation.type === "pixelate" || annotation.type === "blur") {
        applyImageEffect(context, annotation, original.image);
      } else {
        drawAnnotation(context, annotation);
      }
    });
    context.restore();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      throw new Error("The browser could not encode the edited PNG.");
    }
    return blob;
  } finally {
    releaseImage(original?.image);
    if (original?.url) {
      URL.revokeObjectURL(original.url);
    }
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }
}
