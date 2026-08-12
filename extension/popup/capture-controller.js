import {
  CAPTURE_INTERVAL_MS,
  MAX_DYNAMIC_GROWTH_RATIO,
  USER_MESSAGES,
} from "../common/constants.js";
import {
  captureVisibleTab,
  connectCapture,
  createTab,
  ensureClipboardPermission,
  getExtensionUrl,
  injectCaptureScript,
  queryActiveTab,
  storageGet,
  storageSet,
} from "../common/browser-api.js";
import { copyPngBlob } from "../common/clipboard.js";
import { deleteCapture, makeCaptureId, pruneExpiredCaptures, saveCapture } from "../common/capture-store.js";
import { makeFilename } from "../common/filename.js";
import { DEFAULT_SETTINGS, normalizeSettings } from "../common/settings.js";
import {
  generateCapturePositions,
  getBoundedDocumentHeight,
  PngStitcher,
  StitchingError,
} from "./stitcher.js";

export class CaptureError extends Error {
  constructor(message, code = "capture-failed") {
    super(message);
    this.name = "CaptureError";
    this.code = code;
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function ensureNotCancelled(signal) {
  if (signal?.aborted) {
    throw new CaptureError("Capture cancelled.", "cancelled");
  }
}

function createPortChannel(port, sessionId, signal) {
  let pending = null;
  let closed = false;

  const onMessage = (message) => {
    if (!pending || message?.sessionId !== sessionId) {
      return;
    }
    const current = pending;
    pending = null;
    if (message.ok === false) {
      current.reject(new CaptureError(message.message || "The page could not be captured.", message.error));
    } else {
      current.resolve(message);
    }
  };
  const onDisconnect = () => {
    closed = true;
    if (pending) {
      const current = pending;
      pending = null;
      current.reject(new CaptureError("The capture page connection closed.", "disconnected"));
    }
  };

  port.onMessage.addListener(onMessage);
  port.onDisconnect.addListener(onDisconnect);

  const abort = () => {
    if (!closed) {
      try {
        port.disconnect();
      } catch {
        // The content script's disconnect handler still provides cleanup.
      }
    }
  };
  signal?.addEventListener("abort", abort, { once: true });

  return {
    get closed() {
      return closed;
    },
    request(message) {
      if (closed) {
        return Promise.reject(new CaptureError("The capture page connection closed.", "disconnected"));
      }
      if (pending) {
        return Promise.reject(new CaptureError("Capture requests overlapped unexpectedly.", "protocol-failed"));
      }
      return new Promise((resolve, reject) => {
        pending = { resolve, reject };
        try {
          port.postMessage({ ...message, sessionId });
        } catch (error) {
          pending = null;
          reject(error);
        }
      });
    },
    close() {
      signal?.removeEventListener("abort", abort);
      if (!closed) {
        try {
          port.disconnect();
        } catch {
          // Already disconnected.
        }
      }
    },
  };
}

async function getCaptureTab() {
  const tabs = await queryActiveTab();
  const tab = tabs?.[0];
  if (!tab || typeof tab.id !== "number" || typeof tab.windowId !== "number") {
    throw new CaptureError(USER_MESSAGES.protectedPage, "no-active-tab");
  }
  return tab;
}

async function verifyCaptureTab(expected) {
  const current = await getCaptureTab();
  if (current.id !== expected.id || current.windowId !== expected.windowId) {
    throw new CaptureError("Capture stopped because the active tab changed.", "tab-changed");
  }
  if (expected.url && current.url && current.url !== expected.url) {
    throw new CaptureError("Capture stopped because the page navigated.", "navigation");
  }
  return current;
}

function normalizeCaptureError(error) {
  if (error instanceof CaptureError || error instanceof StitchingError) {
    return error;
  }
  if (error?.message?.includes("Cannot access") || error?.message?.includes("not allowed")) {
    return new CaptureError(USER_MESSAGES.protectedPage, "protected-page");
  }
  return new CaptureError(error instanceof Error ? error.message : "The page could not be captured.");
}

async function captureFullPage(tab, { signal, onProgress }) {
  const sessionId = makeCaptureId();
  let channel = null;
  let stitcher = null;
  let restored = false;
  const initialTab = { id: tab.id, windowId: tab.windowId, url: tab.url || "" };

  try {
    onProgress?.({ phase: "preparing", message: "Preparing page…" });
    await injectCaptureScript(tab.id);
    channel = createPortChannel(connectCapture(tab.id, sessionId), sessionId, signal);
    const ready = await channel.request({ type: "start" });
    const initialHeight = ready.documentHeight;
    const viewportHeight = ready.viewportHeight;
    const viewportWidth = ready.viewportWidth;
    if (!Number.isFinite(initialHeight) || !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
      throw new CaptureError("KoalaShot could not measure the page.", "measurement-failed");
    }

    stitcher = new PngStitcher({
      initialDocumentHeight: initialHeight,
      viewportWidth,
      viewportHeight,
      growthRatio: MAX_DYNAMIC_GROWTH_RATIO,
    });
    let targetHeight = Math.max(viewportHeight, initialHeight);
    let growthWarning = false;
    let positions = generateCapturePositions(targetHeight, viewportHeight);
    let index = 0;
    let lastCaptureAt = 0;

    while (index < positions.length) {
      ensureNotCancelled(signal);
      const isFinal = index === positions.length - 1;
      const requestedY = positions[index];
      await verifyCaptureTab(initialTab);
      onProgress?.({
        phase: "capturing",
        message: `Capturing section ${index + 1} of ${positions.length}…`,
        current: index + 1,
        total: positions.length,
      });
      const scrolled = await channel.request({
        type: "scroll",
        requestedY,
        sectionIndex: index,
        sectionCount: positions.length,
        isFinal,
      });
      if (scrolled.pageUrl && initialTab.url && scrolled.pageUrl !== initialTab.url) {
        throw new CaptureError("Capture stopped because the page navigated.", "navigation");
      }
      if (scrolled.viewportWidth !== viewportWidth || scrolled.viewportHeight !== viewportHeight) {
        throw new CaptureError(`Capture stopped because the browser viewport changed (${viewportWidth}x${viewportHeight} → ${scrolled.viewportWidth}x${scrolled.viewportHeight}).`, "viewport-changed");
      }

      const bounded = getBoundedDocumentHeight(initialHeight, scrolled.documentHeight, MAX_DYNAMIC_GROWTH_RATIO);
      if (bounded.exceeded) {
        growthWarning = true;
      }
      targetHeight = Math.max(targetHeight, Math.max(viewportHeight, bounded.height));
      stitcher.updateDocumentHeight(scrolled.documentHeight);

      const boundedFinalY = Math.max(0, targetHeight - viewportHeight);
      if (isFinal && boundedFinalY > scrolled.actualY + 1) {
        positions = generateCapturePositions(targetHeight, viewportHeight);
        continue;
      }

      const elapsedSincePrevious = Date.now() - lastCaptureAt;
      if (lastCaptureAt > 0 && elapsedSincePrevious < CAPTURE_INTERVAL_MS) {
        await wait(CAPTURE_INTERVAL_MS - elapsedSincePrevious);
      }
      await verifyCaptureTab(initialTab);
      ensureNotCancelled(signal);
      onProgress?.({ phase: "capturing", message: `Capturing section ${index + 1} of ${positions.length}…`, current: index + 1, total: positions.length });
      let dataUrl;
      try {
        dataUrl = await captureVisibleTab(tab.windowId);
      } catch (error) {
        throw normalizeCaptureError(error);
      }
      await stitcher.add(dataUrl, scrolled.actualY);
      lastCaptureAt = Date.now();
      index += 1;

      const nextPositions = generateCapturePositions(targetHeight, viewportHeight);
      if (nextPositions.length !== positions.length || nextPositions.at(-1) !== positions.at(-1)) {
        positions = nextPositions;
      }
    }

    onProgress?.({ phase: "processing", message: "Processing PNG…" });
    const blob = await stitcher.toBlob();
    return {
      blob,
      filename: makeFilename(ready.pageUrl || tab.url),
      sourceUrl: ready.pageUrl || tab.url || "",
      sourceTitle: typeof ready.pageTitle === "string" ? ready.pageTitle : "",
      width: stitcher.outputWidth,
      height: stitcher.outputHeight,
      warning: growthWarning ? "The page kept growing; dynamically added content beyond the safe limit may not be included." : "",
    };
  } catch (error) {
    throw normalizeCaptureError(error);
  } finally {
    if (channel && !channel.closed && !restored) {
      try {
        await channel.request({ type: "restore" });
      } catch {
        // Port disconnect invokes the content-script watchdog cleanup.
      }
      restored = true;
    }
    channel?.close();
    stitcher?.clear();
  }
}

export async function captureScreenshot(options = {}) {
  const tab = await getCaptureTab();
  const result = await captureFullPage(tab, options);
  return result;
}

export async function copyScreenshot(blob) {
  await copyPngBlob(blob, (await import("../common/browser-api.js")).getApi());
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function openEditorForCapture(result) {
  const id = makeCaptureId();
  await saveCapture({
    id,
    blob: result.blob,
    createdAt: Date.now(),
    sourceUrl: result.sourceUrl,
    sourceTitle: result.sourceTitle,
    width: result.width,
    height: result.height,
    filename: result.filename,
  });
  try {
    await createTab(`${getExtensionUrl("editor/editor.html")}?capture=${encodeURIComponent(id)}`);
  } catch (error) {
    await deleteCapture(id);
    throw error;
  }
  return id;
}

export async function prepareClipboard() {
  try {
    return await ensureClipboardPermission();
  } catch {
    return false;
  }
}

export async function pruneTemporaryCaptures() {
  try {
    await pruneExpiredCaptures();
  } catch {
    // A temporary-store failure should not prevent a new capture attempt.
  }
}

export async function loadSettings() {
  const values = await storageGet(DEFAULT_SETTINGS);
  return normalizeSettings(values);
}

export async function saveSettings(settings) {
  await storageSet({ openEditorAfterCapture: Boolean(settings.openEditorAfterCapture) });
}
