import { t } from "../common/i18n.js";
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
      image.onerror = () => reject(new Error(t("ui_the_original_png_could_not_be_decoded")));
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
    throw new Error(t("ui_the_crop_selection_is_outside_the_screenshot"));
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

const effectCache = new WeakMap();

export function clearEffectCache(image) {
  const cache = effectCache.get(image);
  if (cache) for (const canvas of cache.values()) { canvas.width = 1; canvas.height = 1; }
  effectCache.delete(image);
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
  const strength = annotation.effectStrength ?? (annotation.type === "pixelate" ? 10 : 8);
  const scale = annotation.type === "pixelate"
    ? Math.min(1 / strength, maximumPreviewDimension / Math.max(source.width, source.height))
    : Math.min(1, maximumPreviewDimension / Math.max(source.width, source.height));
  let cache = effectCache.get(sourceImage);
  if (!cache) { cache = new Map(); effectCache.set(sourceImage, cache); }
  const key = JSON.stringify([annotation.type, source.x, source.y, source.width, source.height, strength]);
  let preview = cache.get(key);
  if (!preview) {
    preview = document.createElement("canvas");
    preview.width = Math.max(1, Math.ceil(source.width * scale));
    preview.height = Math.max(1, Math.ceil(source.height * scale));
    const previewContext = preview.getContext("2d");
    if (!previewContext) {
      throw new Error(t("ui_the_browser_could_not_allocate_the_effect_preview"));
    }
    previewContext.imageSmoothingEnabled = annotation.type !== "pixelate";
    if (annotation.type === "blur") {
      previewContext.filter = `blur(${Math.max(0.5, strength * scale)}px)`;
    }
    previewContext.drawImage(sourceImage, source.x, source.y, source.width, source.height, 0, 0, preview.width, preview.height);
    if (cache.size >= 8) {
      const oldest = cache.keys().next().value;
      const expired = cache.get(oldest); expired.width = 1; expired.height = 1;
      cache.delete(oldest);
    }
    cache.set(key, preview);
  }
  context.save();
  context.beginPath();
  context.rect(annotation.x, annotation.y, annotation.width, annotation.height);
  context.clip();
  context.imageSmoothingEnabled = annotation.type !== "pixelate";
  context.drawImage(preview, 0, 0, preview.width, preview.height, source.x, source.y, source.width, source.height);
  context.restore();
}

// Redaction is a final protection mask, independent of annotation order.
// Preview and export share this compositor and use original-image coordinates.
export function drawEditorAnnotations(context, annotations, sourceImage) {
  for (const annotation of annotations) {
    if (annotation.type === "redact") continue;
    if (annotation.type === "pixelate" || annotation.type === "blur") applyImageEffect(context, annotation, sourceImage);
    else drawAnnotation(context, annotation);
  }
  for (const annotation of annotations) {
    if (annotation.type !== "redact") continue;
    const x = Math.floor(annotation.x), y = Math.floor(annotation.y);
    drawAnnotation(context, { ...annotation, x, y,
      width: Math.ceil(annotation.x + annotation.width) - x,
      height: Math.ceil(annotation.y + annotation.height) - y });
  }
}

export async function renderEditorResultBlob(capture, annotations = capture?.annotations || []) {
  if (!(capture?.blob instanceof Blob) || capture.blob.type !== "image/png") {
    throw new Error(t("ui_the_editor_capture_is_unavailable"));
  }
  if (!Number.isInteger(capture.width) || !Number.isInteger(capture.height) || capture.width <= 0 || capture.height <= 0) {
    throw new Error(t("ui_the_screenshot_dimensions_are_invalid"));
  }
  const validation = tryValidateAnnotations(annotations);
  if (!validation.valid) {
    throw new Error(t("ui_the_annotation_draft_is_invalid"));
  }
  const cropValidation = tryValidateCrop(capture.crop || null);
  if (!cropValidation.valid) {
    throw new Error(t("ui_the_crop_selection_is_invalid"));
  }
  const crop = normalizeCropToImage(cropValidation.crop, capture.width, capture.height);
  const rawBytes = capture.width * capture.height * 4;
  if (capture.width > MAX_CANVAS_WIDTH || capture.height > MAX_CANVAS_HEIGHT
    || capture.width * capture.height > MAX_CANVAS_PIXELS || rawBytes * 2 > MAX_RAW_CANVAS_BYTES) {
    throw new Error(t("ui_this_page_is_too_large_to_export_as_one_png_at_the_current_resolution"));
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
      throw new Error(t("ui_this_page_is_too_large_to_export_as_one_png_at_the_current_resolution"));
    }
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error(t("ui_the_browser_could_not_allocate_an_export_canvas"));
    }
    context.drawImage(original.image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    context.save();
    context.translate?.(-crop.x, -crop.y);
    validation.annotations.forEach(validateAnnotation);
    drawEditorAnnotations(context, validation.annotations, original.image);
    context.restore();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      throw new Error(t("ui_the_browser_could_not_encode_the_edited_png"));
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
