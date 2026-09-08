import {
  captureScreenshot, copyScreenshot, downloadBlob, loadSettings,
  openEditorForCapture, prepareClipboard, pruneTemporaryCaptures, saveSettings,
} from "./capture-controller.js";
import { createSerializedWriter } from "../common/async-queue.js";
import { getApi } from "../common/browser-api.js";
import { initializeFooter } from "../common/product-links.js";

const $ = (id) => document.getElementById(id);
const captureTarget = $("capture-target");
const status = $("status");
const preview = $("capture-preview");
const progressBar = $("progress-bar");
const queueSettingsSave = createSerializedWriter(saveSettings);
let initializing = true;
let phase = "idle";
let activeController = null;
let lastCapturedResult = null;
let previewUrl = null;
let settingsRevision = 0;
let pendingSettings = 0;
let savedTarget = "page";

function setStatus(message, progress = null) {
  status.textContent = message;
  if (progress !== null) progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
}

function setPhase(value) {
  phase = value;
  const busy = value !== "idle" || initializing;
  for (const id of ["copy-button", "save-button", "edit-button", "copy-result-button", "save-result-button", "edit-result-button", "capture-again-button"]) $(id).disabled = busy;
  captureTarget.disabled = busy;
  $("cancel-button").hidden = value !== "capturing";
  $("progress-track").hidden = value !== "capturing";
  $("capture-actions").hidden = Boolean(lastCapturedResult);
  $("result-card").hidden = !lastCapturedResult;
  document.querySelector(".keep-open").hidden = Boolean(lastCapturedResult) && value !== "capturing";
  document.body.dataset.phase = value;
  if (value === "idle") progressBar.style.width = "0";
}

function showResult(result) {
  const oldUrl = previewUrl;
  previewUrl = URL.createObjectURL(result.blob);
  preview.src = previewUrl;
  lastCapturedResult = result;
  if (oldUrl) URL.revokeObjectURL(oldUrl);
  $("result-meta").textContent = `${result.width} × ${result.height}px · ${(result.blob.size / 1024 / 1024).toFixed(2)} MB`;
  $("result-label").textContent = "Completed capture";
  $("capture-warning").textContent = result.warning || "";
  $("capture-warning").hidden = !result.warning;
}

function errorMessage(error) { return error instanceof Error ? error.message : "The operation failed."; }

async function deliver(mode, result) {
  if (mode === "edit") {
    setPhase("opening-editor"); setStatus("Opening editor…");
    await openEditorForCapture(result);
    setStatus("Editor opened with the original PNG.");
  } else if (mode === "copy") {
    setPhase("exporting"); setStatus("Copying original PNG…");
    try { await copyScreenshot(result.blob); setStatus("Full-page screenshot copied."); }
    catch (error) { setStatus(`Copy failed: ${errorMessage(error)} Retry Copy or save the completed PNG.`); }
  } else {
    setPhase("exporting");
    downloadBlob(result.blob, result.filename); setStatus("PNG save started.");
  }
}

async function runCapture(mode) {
  if (phase !== "idle" || initializing) return;
  const target = captureTarget.value;
  activeController = new AbortController();
  const controller = activeController;
  setPhase("capturing");
  if (lastCapturedResult) $("result-label").textContent = "Previous capture — kept until a new capture succeeds";
  try {
    let clipboardReady = true;
    if (mode === "copy") {
      setStatus("Requesting clipboard permission…");
      clipboardReady = await prepareClipboard();
    }
    const result = await captureScreenshot({ signal: controller.signal, target,
      onProgress: ({ message, current, total, phase: capturePhase }) => setStatus(message,
        capturePhase === "capturing" && total ? current / total * 82 : capturePhase === "processing" ? 90 : 4),
    });
    if (controller.signal.aborted) return;
    showResult(result);
    if (mode === "copy" && !clipboardReady) {
      setStatus("Clipboard permission was not granted. Retry Copy or save the completed PNG.");
    } else await deliver(mode, result);
  } catch (error) {
    setStatus(error?.code === "cancelled" || controller.signal.aborted
      ? "Capture cancelled. The page was restored." : errorMessage(error));
  } finally { activeController = null; setPhase("idle"); }
}

async function useResult(mode) {
  if (phase !== "idle" || !lastCapturedResult) return;
  const permission = mode === "copy" ? prepareClipboard() : Promise.resolve(true);
  setPhase(mode === "edit" ? "opening-editor" : "exporting");
  try {
    if (!(await permission)) throw new Error("Clipboard permission was not granted. Save the completed PNG instead.");
    await deliver(mode, lastCapturedResult);
  } catch (error) { setStatus(errorMessage(error)); }
  finally { setPhase("idle"); }
}

for (const mode of ["copy", "save", "edit"]) {
  $(`${mode}-button`).addEventListener("click", () => void runCapture(mode));
  $(`${mode}-result-button`).addEventListener("click", () => void useResult(mode));
}
$("capture-again-button").addEventListener("click", () => {
  $("capture-actions").hidden = false;
  $("edit-button").focus();
  setStatus("Choose how to use your next capture. The previous PNG stays available.");
});
$("cancel-button").addEventListener("click", () => activeController?.abort());
captureTarget.addEventListener("change", () => {
  const revision = ++settingsRevision;
  pendingSettings++;
  const target = captureTarget.value;
  void queueSettingsSave({ captureTarget: target }).then(() => {
    savedTarget = target;
    if (revision === settingsRevision) $("settings-status").textContent = "";
  }).catch(() => {
    if (revision !== settingsRevision) return;
    captureTarget.value = savedTarget;
    $("settings-status").textContent = "Setting could not be saved. Choose the capture area again to retry.";
  }).finally(() => { pendingSettings--; });
});
getApi().storage?.onChanged?.addListener((changes, area) => {
  if (area !== "local" || !changes.captureTarget) return;
  savedTarget = changes.captureTarget.newValue === "internal" ? "internal" : "page";
  if (phase === "idle" && !pendingSettings) captureTarget.value = savedTarget;
});

void initializeFooter();
void pruneTemporaryCaptures();
void (async () => {
  try {
    const settings = await loadSettings();
    savedTarget = settings.captureTarget; captureTarget.value = savedTarget;
    await queueSettingsSave(settings);
  } catch { $("settings-status").textContent = "Settings are unavailable. Capture uses the area selected here."; }
  finally { initializing = false; setPhase("idle"); document.documentElement.dataset.koalashotReady = "true"; }
})();
window.addEventListener("pagehide", () => { activeController?.abort(); if (previewUrl) URL.revokeObjectURL(previewUrl); });
