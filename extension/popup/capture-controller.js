import {
  CAPTURE_INTERVAL_MS,
  CAPTURE_REQUEST_TIMEOUT_MS,
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

async function withTimeout(promise, milliseconds, error) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(error), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
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
    if (message.ok !== false && message.type !== pending.expectedType) return;
    const current = pending;
    pending = null;
    clearTimeout(current.timer);
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
      clearTimeout(current.timer);
      current.reject(new CaptureError("The capture page connection closed.", "disconnected"));
    }
  };

  port.onMessage.addListener(onMessage);
  port.onDisconnect.addListener(onDisconnect);

  const abort = () => {
    if (pending) {
      const current = pending;
      pending = null;
      clearTimeout(current.timer);
      current.reject(new CaptureError("Capture cancelled.", "cancelled"));
    }
    if (!closed) {
      try {
        port.disconnect();
      } catch {
        // The content script's disconnect handler still provides cleanup.
      }
      closed = true;
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
        const timer = setTimeout(() => {
          if (!pending) {
            return;
          }
          pending = null;
          reject(new CaptureError("The page did not respond to the capture request in time.", "request-timeout"));
        }, CAPTURE_REQUEST_TIMEOUT_MS);
        pending = { resolve, reject, timer, expectedType: { start: "ready", scroll: "scrolled", restore: "restored", ping: "pong" }[message.type] };
        try {
          port.postMessage({ ...message, sessionId });
        } catch (error) {
          clearTimeout(timer);
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
      closed = true;
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

function isSameCaptureRect(expected, actual) {
  if (!expected || !actual) {
    return false;
  }
  return ["left", "top", "width", "height"].every((key) => (
    Number.isFinite(expected[key])
      && Number.isFinite(actual[key])
      && Math.abs(expected[key] - actual[key]) < 1
  ));
}

function verifyFrame(expected, actual) {
  const keys = ["actualX", "actualY", "viewportWidth", "viewportHeight", "screenViewportWidth", "screenViewportHeight", "documentHeight", "documentWidth"];
  if (keys.some((key) => !Number.isFinite(actual[key]) || Math.abs(expected[key] - actual[key]) > 0.5)
    || expected.frameRevision !== actual.frameRevision
    || expected.pageUrl !== actual.pageUrl || !isSameCaptureRect(expected.captureRect, actual.captureRect)) {
    throw new CaptureError("The page moved or changed during the screenshot. Wait for the page to settle and capture again.", "frame-changed");
  }
}

async function captureFullPage(tab, { signal, onProgress, target = "page" }) {
  const sessionId = makeCaptureId();
  let channel = null;
  let stitcher = null;
  let restored = false;
  const initialTab = { id: tab.id, windowId: tab.windowId, url: tab.url || "" };
  const deadline = Date.now() + 5 * 60 * 1000;

  try {
    ensureNotCancelled(signal);
    onProgress?.({ phase: "preparing", message: "Preparing page…" });
    await withTimeout(
      injectCaptureScript(tab.id),
      CAPTURE_REQUEST_TIMEOUT_MS,
      new CaptureError("KoalaShot could not start on this page in time.", "injection-timeout"),
    );
    ensureNotCancelled(signal);
    channel = createPortChannel(connectCapture(tab.id, sessionId), sessionId, signal);
    const captureTarget = target === "internal" ? "internal" : "page";
    const ready = await channel.request({ type: "start", target: captureTarget });
    const initialHeight = ready.documentHeight;
    const viewportHeight = ready.viewportHeight;
    const viewportWidth = ready.viewportWidth;
    const screenViewportWidth = ready.screenViewportWidth ?? viewportWidth;
    const screenViewportHeight = ready.screenViewportHeight ?? viewportHeight;
    const captureRect = ready.captureRect || {
      left: 0,
      top: 0,
      width: screenViewportWidth,
      height: screenViewportHeight,
    };
    if (!Number.isFinite(initialHeight) || !Number.isFinite(viewportHeight) || viewportHeight <= 0
      || !Number.isFinite(viewportWidth) || viewportWidth <= 0
      || !Number.isFinite(screenViewportWidth) || screenViewportWidth <= 0
      || !Number.isFinite(screenViewportHeight) || screenViewportHeight <= 0) {
      throw new CaptureError("KoalaShot could not measure the page.", "measurement-failed");
    }

    stitcher = new PngStitcher({
      initialDocumentHeight: initialHeight,
      viewportWidth,
      viewportHeight,
      screenViewportWidth,
      screenViewportHeight,
      captureRect,
      growthRatio: MAX_DYNAMIC_GROWTH_RATIO,
    });
    let targetHeight = Math.max(viewportHeight, initialHeight);
    let growthWarning = false;
    let widthWarning = ready.documentWidth > viewportWidth + 1;
    let positions = generateCapturePositions(targetHeight, viewportHeight);
    let index = 0;
    let lastCaptureAt = 0;

    while (index < positions.length) {
      ensureNotCancelled(signal);
      if (Date.now() > deadline) throw new CaptureError("Capture exceeded five minutes. Try a smaller capture area.", "capture-timeout");
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
      ensureNotCancelled(signal);
      if (!Number.isFinite(scrolled.actualY) || Math.abs(scrolled.actualY - requestedY) > 1) {
        throw new CaptureError("The page could not reach the requested scroll position. Its layout may have changed or scrolling is locked.", "scroll-stalled");
      }
      if (!Number.isFinite(scrolled.documentHeight) || scrolled.documentHeight < targetHeight - 1) {
        throw new CaptureError("Capture stopped because the page became shorter. Wait for the page to finish loading and try again.", "page-shrank");
      }
      widthWarning ||= scrolled.documentWidth > viewportWidth + 1;
      if (scrolled.pageUrl && initialTab.url && scrolled.pageUrl !== initialTab.url) {
        throw new CaptureError("Capture stopped because the page navigated.", "navigation");
      }
      if (scrolled.viewportWidth !== viewportWidth || scrolled.viewportHeight !== viewportHeight
        || (scrolled.screenViewportWidth ?? screenViewportWidth) !== screenViewportWidth
        || (scrolled.screenViewportHeight ?? screenViewportHeight) !== screenViewportHeight
        || !isSameCaptureRect(captureRect, scrolled.captureRect || captureRect)) {
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
      const beforeFrame = await channel.request({ type: "ping" });
      verifyFrame(scrolled, beforeFrame);
      onProgress?.({ phase: "capturing", message: `Capturing section ${index + 1} of ${positions.length}…`, current: index + 1, total: positions.length });
      let dataUrl;
      try {
        dataUrl = await withTimeout(captureVisibleTab(tab.windowId, { signal, beforeCapture: async () => {
          ensureNotCancelled(signal);
          await verifyCaptureTab(initialTab);
          verifyFrame(scrolled, await channel.request({ type: "ping" }));
        } }), CAPTURE_REQUEST_TIMEOUT_MS,
          new CaptureError("The browser screenshot request timed out.", "capture-timeout"));
      } catch (error) {
        throw normalizeCaptureError(error);
      }
      ensureNotCancelled(signal);
      await verifyCaptureTab(initialTab);
      const afterFrame = await channel.request({ type: "ping" });
      verifyFrame(beforeFrame, afterFrame);
      await stitcher.add(dataUrl, scrolled.actualY);
      ensureNotCancelled(signal);
      lastCaptureAt = Date.now();
      index += 1;

      const nextPositions = generateCapturePositions(targetHeight, viewportHeight);
      if (nextPositions.length !== positions.length || nextPositions.at(-1) !== positions.at(-1)) {
        positions = nextPositions;
      }
    }

    await channel.request({ type: "restore" });
    restored = true;
    channel.close();
    ensureNotCancelled(signal);
    onProgress?.({ phase: "processing", message: "Processing PNG…" });
    const blob = await stitcher.toBlob();
    ensureNotCancelled(signal);
    return {
      blob,
      filename: makeFilename(ready.pageUrl || tab.url),
      sourceUrl: safeSourceOrigin(ready.pageUrl || tab.url),
      sourceTitle: typeof ready.pageTitle === "string" ? ready.pageTitle : "",
      width: stitcher.outputWidth,
      height: stitcher.outputHeight,
      warning: [growthWarning ? "The page kept growing; dynamically added content beyond the safe limit may not be included." : "",
        widthWarning ? "Vertical capture only: content beyond the right edge of the capture area is not included." : ""].filter(Boolean).join(" "),
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
  ensureNotCancelled(options.signal);
  const tab = await getCaptureTab();
  const result = await captureFullPage(tab, options);
  return result;
}

function safeSourceOrigin(url) {
  try { return new URL(url).origin; } catch { return ""; }
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
    warning: result.warning || "",
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
  await storageSet({
    openEditorAfterCapture: false,
    captureTarget: settings.captureTarget === "internal" ? "internal" : "page",
  });
}
