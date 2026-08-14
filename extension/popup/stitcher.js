import {
  MAX_CANVAS_HEIGHT,
  MAX_CANVAS_PIXELS,
  MAX_CANVAS_WIDTH,
  MAX_RAW_CANVAS_BYTES,
} from "../common/constants.js";

export class StitchingError extends Error {
  constructor(message, code = "stitching-failed") {
    super(message);
    this.name = "StitchingError";
    this.code = code;
  }
}

export function cssToBitmapPixel(cssPixels, scale) {
  return Math.round(cssPixels * scale);
}

export function generateCapturePositions(documentHeight, viewportHeight) {
  if (!Number.isFinite(documentHeight) || !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    throw new TypeError("Document and viewport heights must be positive numbers.");
  }
  const maximumScroll = Math.max(0, documentHeight - viewportHeight);
  const positions = [0];
  for (let position = viewportHeight; position < maximumScroll; position += viewportHeight) {
    positions.push(position);
  }
  if (positions.at(-1) !== maximumScroll) {
    positions.push(maximumScroll);
  }
  return positions;
}

export function getBoundedDocumentHeight(initialHeight, observedHeight, growthRatio = 0.25) {
  const maximumAllowed = initialHeight * (1 + growthRatio);
  return {
    maximumAllowed,
    height: Math.min(Math.max(initialHeight, observedHeight), maximumAllowed),
    exceeded: observedHeight > maximumAllowed,
  };
}

export function estimateRawMemory(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) {
    return Number.POSITIVE_INFINITY;
  }
  return width * height * 4;
}

export function calculateSectionPlacement({
  scrollY,
  bitmapHeight,
  scaleY,
  previousBottom = 0,
  outputHeight,
}) {
  const destinationY = cssToBitmapPixel(scrollY, scaleY);
  const destinationStart = Math.max(destinationY, previousBottom);
  const sourceStart = Math.max(0, destinationStart - destinationY);
  const availableHeight = Math.max(0, Math.min(bitmapHeight - sourceStart, outputHeight - destinationStart));
  return {
    destinationY,
    destinationStart,
    sourceStart,
    availableHeight,
    nextBottom: Math.max(previousBottom, destinationStart + availableHeight),
  };
}

function dataUrlToBlob(dataUrl) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) {
    throw new StitchingError("The browser returned an invalid PNG capture.", "decode-failed");
  }
  let binary;
  try {
    binary = atob(match[1]);
  } catch {
    throw new StitchingError("The browser returned an undecodable PNG capture.", "decode-failed");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: "image/png" });
}

async function decodePngDataUrl(dataUrl) {
  const blob = dataUrlToBlob(dataUrl);
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch {
      throw new StitchingError("The captured PNG could not be decoded.", "decode-failed");
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new StitchingError("The captured PNG could not be decoded.", "decode-failed"));
      image.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function releaseBitmap(bitmap) {
  if (typeof bitmap?.close === "function") {
    bitmap.close();
  }
}

export class PngStitcher {
  constructor({
    initialDocumentHeight,
    viewportWidth,
    viewportHeight,
    screenViewportWidth = viewportWidth,
    screenViewportHeight = viewportHeight,
    captureRect = { left: 0, top: 0, width: screenViewportWidth, height: screenViewportHeight },
    growthRatio = 0.25,
  }) {
    this.initialDocumentHeight = initialDocumentHeight;
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.screenViewportWidth = screenViewportWidth;
    this.screenViewportHeight = screenViewportHeight;
    this.captureRect = { ...captureRect };
    this.growthRatio = growthRatio;
    this.maxDocumentHeight = Math.max(viewportHeight, initialDocumentHeight * (1 + growthRatio));
    this.targetDocumentHeight = Math.max(viewportHeight, initialDocumentHeight);
    this.canvas = null;
    this.context = null;
    this.scaleX = null;
    this.scaleY = null;
    this.previousBottom = 0;
    this.lastBitmapWidth = null;
    this.lastBitmapHeight = null;
    this.sourceX = null;
    this.sourceWidth = null;
    this.sourceHeight = null;
    this.outputWidth = null;
    this.outputHeight = null;
  }

  updateDocumentHeight(observedHeight) {
    const bounded = getBoundedDocumentHeight(this.initialDocumentHeight, observedHeight, this.growthRatio);
    this.targetDocumentHeight = Math.max(this.targetDocumentHeight, Math.max(this.viewportHeight, bounded.height));
    return bounded;
  }

  ensureCanvas(bitmap) {
    if (this.canvas) {
      return;
    }
    this.scaleX = bitmap.width / this.screenViewportWidth;
    this.scaleY = bitmap.height / this.screenViewportHeight;
    const sourceX = cssToBitmapPixel(this.captureRect.left, this.scaleX);
    const sourceY = cssToBitmapPixel(this.captureRect.top, this.scaleY);
    const width = cssToBitmapPixel(this.captureRect.width, this.scaleX);
    const height = cssToBitmapPixel(this.captureRect.height, this.scaleY);
    if (sourceX < 0 || sourceY < 0 || width <= 0 || height <= 0
      || sourceX + width > bitmap.width || sourceY + height > bitmap.height) {
      throw new StitchingError("The browser capture did not contain the selected area.", "capture-region-failed");
    }
    const maximumHeight = cssToBitmapPixel(this.maxDocumentHeight, this.scaleY);
    const bytes = estimateRawMemory(width, maximumHeight);
    if (width > MAX_CANVAS_WIDTH || maximumHeight > MAX_CANVAS_HEIGHT
      || width * maximumHeight > MAX_CANVAS_PIXELS
      || bytes * 2 > MAX_RAW_CANVAS_BYTES) {
      throw new StitchingError("This page is too large to create as one PNG at the current resolution.", "too-large");
    }

    let canvas;
    let context;
    try {
      canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = maximumHeight;
      if (canvas.width !== width || canvas.height !== maximumHeight) {
        throw new StitchingError("This page is too large to create as one PNG at the current resolution.", "too-large");
      }
      context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        throw new StitchingError("The browser could not allocate an image canvas.", "canvas-failed");
      }
    } catch (error) {
      if (error instanceof StitchingError) {
        throw error;
      }
      throw new StitchingError("This page is too large to create as one PNG at the current resolution.", "too-large");
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, maximumHeight);
    this.canvas = canvas;
    this.context = context;
    this.lastBitmapWidth = bitmap.width;
    this.lastBitmapHeight = bitmap.height;
    this.sourceX = sourceX;
    this.sourceWidth = width;
    this.sourceHeight = height;
  }

  async add(dataUrl, scrollY) {
    const bitmap = await decodePngDataUrl(dataUrl);
    try {
      this.ensureCanvas(bitmap);
      if (bitmap.width !== this.lastBitmapWidth || bitmap.height !== this.lastBitmapHeight) {
        throw new StitchingError("The browser viewport changed during capture.", "viewport-changed");
      }
      const placement = calculateSectionPlacement({
        scrollY,
        bitmapHeight: this.sourceHeight,
        scaleY: this.scaleY,
        previousBottom: this.previousBottom,
        outputHeight: this.canvas.height,
      });
      if (placement.availableHeight > 0) {
        this.context.drawImage(
          bitmap,
          this.sourceX,
          cssToBitmapPixel(this.captureRect.top, this.scaleY) + placement.sourceStart,
          this.sourceWidth,
          placement.availableHeight,
          0,
          placement.destinationStart,
          this.canvas.width,
          placement.availableHeight,
        );
      }
      this.previousBottom = placement.nextBottom;
    } finally {
      releaseBitmap(bitmap);
    }
  }

  async toBlob() {
    if (!this.canvas) {
      throw new StitchingError("No captured sections are available.", "empty-capture");
    }
    const finalHeight = Math.min(
      this.canvas.height,
      Math.max(this.canvas.height > 0 ? 1 : 0, cssToBitmapPixel(this.targetDocumentHeight, this.scaleY)),
    );
    if (finalHeight <= 0) {
      throw new StitchingError("The browser could not determine the PNG dimensions.", "canvas-failed");
    }
    let outputCanvas = this.canvas;
    if (finalHeight !== this.canvas.height) {
      try {
        outputCanvas = document.createElement("canvas");
        outputCanvas.width = this.canvas.width;
        outputCanvas.height = finalHeight;
        if (outputCanvas.width !== this.canvas.width || outputCanvas.height !== finalHeight) {
          throw new StitchingError("This page is too large to create as one PNG at the current resolution.", "too-large");
        }
        const outputContext = outputCanvas.getContext("2d", { alpha: false });
        if (!outputContext) {
          throw new StitchingError("The browser could not allocate an image canvas.", "canvas-failed");
        }
        outputContext.drawImage(this.canvas, 0, 0, this.canvas.width, finalHeight, 0, 0, outputCanvas.width, outputCanvas.height);
      } catch (error) {
        if (error instanceof StitchingError) {
          throw error;
        }
        throw new StitchingError("This page is too large to create as one PNG at the current resolution.", "too-large");
      }
    }
    const blob = await new Promise((resolve) => outputCanvas.toBlob(resolve, "image/png"));
    if (outputCanvas !== this.canvas) {
      outputCanvas.width = 1;
      outputCanvas.height = 1;
    }
    if (!blob) {
      throw new StitchingError("The browser could not encode the PNG.", "encode-failed");
    }
    this.outputWidth = this.canvas.width;
    this.outputHeight = finalHeight;
    return blob;
  }

  clear() {
    this.context = null;
    this.canvas = null;
  }
}
