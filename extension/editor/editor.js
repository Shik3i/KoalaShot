import { getApi, ensureClipboardPermission } from "../common/browser-api.js";
import { copyPngBlob } from "../common/clipboard.js";
import { deleteCapture, getCapture, pruneExpiredCaptures } from "../common/capture-store.js";
import { downloadBlob } from "../popup/capture-controller.js";
import { renderEditorResultBlob } from "./editor-export.js";

const loadingState = document.querySelector("#loading-state");
const errorState = document.querySelector("#error-state");
const errorMessage = document.querySelector("#error-message");
const imageState = document.querySelector("#image-state");
const image = document.querySelector("#capture-image");
const metadata = document.querySelector("#capture-meta");
const status = document.querySelector("#status");
const copyButton = document.querySelector("#copy-button");
const saveButton = document.querySelector("#save-button");
const discardButton = document.querySelector("#discard-button");
const captureId = new URLSearchParams(location.search).get("capture");
let capture = null;
let objectUrl = null;

function setStatus(message) {
  status.textContent = message;
}

function showError(message) {
  loadingState.hidden = true;
  imageState.hidden = true;
  errorState.hidden = false;
  errorMessage.textContent = message;
  copyButton.disabled = true;
  saveButton.disabled = true;
  discardButton.disabled = !capture;
}

function formatMeta(record) {
  let hostname = "Unknown source";
  try {
    hostname = new URL(record.sourceUrl).hostname || hostname;
  } catch {
    // The source URL is untrusted metadata and may be absent.
  }
  const dimensions = Number.isFinite(record.width) && Number.isFinite(record.height)
    ? `${record.width} × ${record.height}px`
    : "Original dimensions unavailable";
  return `${hostname} · ${dimensions}`;
}

async function exportCurrent() {
  return renderEditorResultBlob(capture);
}

copyButton.addEventListener("click", async () => {
  try {
    if (!(await ensureClipboardPermission())) {
      throw new Error("Clipboard permission was not granted.");
    }
    setStatus("Copying…");
    await copyPngBlob(await exportCurrent(), getApi());
    setStatus("Screenshot copied.");
  } catch (error) {
    setStatus(`Copy failed: ${error instanceof Error ? error.message : "The clipboard could not be updated."}`);
  }
});

saveButton.addEventListener("click", async () => {
  try {
    setStatus("Preparing PNG save…");
    const blob = await exportCurrent();
    downloadBlob(blob, capture.filename || "KoalaShot_screenshot.png");
    setStatus("PNG save started.");
  } catch (error) {
    setStatus(`Save failed: ${error instanceof Error ? error.message : "The PNG could not be saved."}`);
  }
});

discardButton.addEventListener("click", async () => {
  if (!capture) {
    return;
  }
  discardButton.disabled = true;
  await deleteCapture(capture.id);
  capture = null;
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  image.removeAttribute("src");
  imageState.hidden = true;
  errorState.hidden = false;
  errorMessage.textContent = "The temporary screenshot was discarded.";
  copyButton.disabled = true;
  saveButton.disabled = true;
  setStatus("Screenshot discarded.");
  window.setTimeout(() => window.close(), 0);
});

window.addEventListener("pagehide", () => {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
  }
});

void (async () => {
  await pruneExpiredCaptures();
  if (!captureId) {
    showError("No temporary capture was specified.");
    return;
  }
  capture = await getCapture(captureId);
  if (!capture) {
    showError("This temporary capture was not found or has expired.");
    return;
  }
  objectUrl = URL.createObjectURL(capture.blob);
  image.src = objectUrl;
  image.alt = capture.sourceTitle ? `Full-page screenshot of ${capture.sourceTitle}` : "Full-page screenshot preview";
  metadata.textContent = formatMeta(capture);
  loadingState.hidden = true;
  errorState.hidden = true;
  imageState.hidden = false;
  copyButton.disabled = false;
  saveButton.disabled = false;
  discardButton.disabled = false;
})();
