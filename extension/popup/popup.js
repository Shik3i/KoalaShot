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

const copyButton = document.querySelector("#copy-button");
const saveButton = document.querySelector("#save-button");
const saveResultButton = document.querySelector("#save-result-button");
const cancelButton = document.querySelector("#cancel-button");
const openEditor = document.querySelector("#open-editor");
const captureTarget = document.querySelector("#capture-target");
const status = document.querySelector("#status");
const progressBar = document.querySelector("#progress-bar");
let activeController = null;
let busy = false;
let lastCapturedResult = null;

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
  if (busy) {
    return;
  }
  setBusy(true);
  lastCapturedResult = null;
  saveResultButton.hidden = true;
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
      target: captureTarget.value,
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

    if (openEditor.checked) {
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
  saveResultButton.hidden = true;
  setStatus("Captured PNG save started.", 100);
  lastCapturedResult = null;
});
cancelButton.addEventListener("click", () => activeController?.abort());
async function persistSettings() {
  await saveSettings({
    openEditorAfterCapture: openEditor.checked,
    captureTarget: captureTarget.value,
  });
}

openEditor.addEventListener("change", () => {
  void persistSettings();
});
captureTarget.addEventListener("change", () => {
  void persistSettings();
});

document.documentElement.dataset.koalashotReady = "true";

void (async () => {
  await pruneTemporaryCaptures();
  try {
    const settings = await loadSettings();
    openEditor.checked = settings.openEditorAfterCapture;
    captureTarget.value = settings.captureTarget;
  } catch {
    openEditor.checked = false;
  }
})();
