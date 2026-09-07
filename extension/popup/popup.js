import {
  captureScreenshot,
  copyScreenshot,
  downloadBlob,
  loadSettings,
  openEditorForCapture,
  prepareClipboard,
  pruneTemporaryCaptures,
  saveSettings,
} from "./capture-controller.js";
import { createSerializedWriter } from "../common/async-queue.js";

const copyButton = document.querySelector("#copy-button");
const saveButton = document.querySelector("#save-button");
const editButton = document.querySelector("#edit-button");
const editResultButton = document.querySelector("#edit-result-button");
const copyResultButton = document.querySelector("#copy-result-button");
const preview = document.querySelector("#capture-preview");
let previewUrl = null;
let initializing = true;
const saveResultButton = document.querySelector("#save-result-button");
const cancelButton = document.querySelector("#cancel-button");
const openEditor = document.querySelector("#open-editor");
const captureTarget = document.querySelector("#capture-target");
const status = document.querySelector("#status");
const progressBar = document.querySelector("#progress-bar");
let activeController = null;
let busy = false;
let lastCapturedResult = null;
const queueSettingsSave = createSerializedWriter(saveSettings);

function setStatus(message, progress = null) {
  status.textContent = message;
  if (progress === null) {
    return;
  }
  progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
}

function setBusy(value) {
  busy = value;
  copyButton.disabled = value;
  saveButton.disabled = value;
  editButton.disabled = value;
  editResultButton.disabled = value;
  copyResultButton.disabled = value;
  saveResultButton.disabled = value;
  openEditor.disabled = value;
  captureTarget.disabled = value;
  cancelButton.hidden = !value;
  if (!value) {
    progressBar.style.width = "0";
  }
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "The operation failed.";
}

async function runCapture(mode) {
  if (busy || initializing) {
    return;
  }
  setBusy(true);
  const config = { target: captureTarget.value, openEditor: openEditor.checked || mode === "edit" };
  lastCapturedResult = null;
  saveResultButton.hidden = true;
  editResultButton.hidden = true; copyResultButton.hidden = true; preview.hidden = true;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  activeController = new AbortController();
  try {
    let clipboardReady = true;
    if (mode === "copy") {
      setStatus("Requesting clipboard permission…");
      clipboardReady = await prepareClipboard();
      if (!clipboardReady) {
        setStatus("Clipboard permission was not granted. Capture will continue; you can still save the PNG.");
      }
    }

    const result = await captureScreenshot({
      signal: activeController.signal,
      target: config.target,
      onProgress: ({ message, current, total, phase }) => {
        if (phase === "capturing" && total) {
          setStatus(message, (current / total) * 82);
        } else if (phase === "processing") {
          setStatus(message, 88);
        } else {
          setStatus(message, 4);
        }
      },
    });

    if (activeController.signal.aborted) return;
    lastCapturedResult = result;
    previewUrl = URL.createObjectURL(result.blob); preview.src = previewUrl;
    preview.hidden = false; saveResultButton.hidden = false;
    editResultButton.hidden = false; copyResultButton.hidden = false;
    if (mode === "copy" && clipboardReady) {
      setStatus("Copying to clipboard…", 92);
      try {
        await copyScreenshot(result.blob);
        setStatus("Full-page screenshot copied.", 100);
      } catch (error) {
        lastCapturedResult = result;
        saveResultButton.hidden = false;
        setStatus(`Copy failed: ${getErrorMessage(error)} Save the completed capture below.`, 100);
      }
    } else if (mode === "copy") {
      lastCapturedResult = result;
      saveResultButton.hidden = false;
      setStatus("Clipboard permission was not granted. Save the completed capture below.", 100);
    } else if (mode === "save") {
      setStatus("Saving PNG…", 92);
      downloadBlob(result.blob, result.filename);
      setStatus("PNG save started.", 100);
    }

    if (result.warning) {
      setStatus(`${status.textContent} ${result.warning}`);
    }

    if (config.openEditor && !activeController.signal.aborted) {
      setStatus("Opening editor…", 98);
      await openEditorForCapture(result);
      setStatus("Editor opened with the original PNG.", 100);
    }
  } catch (error) {
    if (error?.code === "cancelled") {
      setStatus("Capture cancelled. The page was restored.");
    } else {
      setStatus(getErrorMessage(error));
    }
  } finally {
    activeController = null;
    setBusy(false);
  }
}

copyButton.addEventListener("click", () => void runCapture("copy"));
saveButton.addEventListener("click", () => void runCapture("save"));
saveResultButton.addEventListener("click", () => {
  if (!lastCapturedResult || busy) {
    return;
  }
  downloadBlob(lastCapturedResult.blob, lastCapturedResult.filename);
  setStatus("Captured PNG save started.", 100);
});
cancelButton.addEventListener("click", () => activeController?.abort());
function persistSettings() {
  const nextSettings = {
    openEditorAfterCapture: openEditor.checked,
    captureTarget: captureTarget.value,
  };
  return queueSettingsSave(nextSettings);
}

openEditor.addEventListener("change", () => {
  void persistSettings();
});
captureTarget.addEventListener("change", () => {
  void persistSettings();
});



void (async () => {
  void pruneTemporaryCaptures();
  try {
    const settings = await loadSettings();
    openEditor.checked = settings.openEditorAfterCapture;
    captureTarget.value = settings.captureTarget;
  } catch {
    openEditor.checked = false;
  } finally {
    initializing = false; setBusy(false);
    document.documentElement.dataset.koalashotReady = "true";
  }
})();

editButton.addEventListener("click", () => void runCapture("edit"));
editResultButton.addEventListener("click", async () => {
  if (!lastCapturedResult || busy) return;
  setBusy(true);
  try { await openEditorForCapture(lastCapturedResult); setStatus("Editor opened with the original PNG."); }
  catch (error) { setStatus(getErrorMessage(error)); }
  finally { setBusy(false); }
});
copyResultButton.addEventListener("click", async () => {
  if (!lastCapturedResult || busy) return;
  const permission = prepareClipboard(); setBusy(true);
  try {
    if (!(await permission)) throw new Error("Clipboard permission was not granted. Save the completed capture below.");
    await copyScreenshot(lastCapturedResult.blob); setStatus("Full-page screenshot copied.");
  } catch (error) { setStatus(getErrorMessage(error)); }
  finally { setBusy(false); }
});
window.addEventListener("pagehide", () => { activeController?.abort(); if (previewUrl) URL.revokeObjectURL(previewUrl); });
